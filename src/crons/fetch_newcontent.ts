import { BulkWriteOperation, Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CONTENTRECORD_DAC_DATA_DOMAIN, DEBUG_ENABLED } from '../consts';
import { COLL_ENTRIES, COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { DataLink, EntryType, EventType, IContent, IEvent, IIndex, IUser, Throttle } from '../types';
import { downloadFile, downloadNewEntries, exceedsLockTime, settlePromises } from './utils';

// fetchNewContent is a simple scraping algorithm that scrapes all known users
// for new content entries.
export async function fetchNewContent(database: MongoDB, client: SkynetClient, throttle: Throttle<number>, userPKToFetch?: string): Promise<number> {
  // fetch all collections
  const usersDB = await database.getCollection<IUser>(COLL_USERS);
  const entriesDB = await database.getCollection<IContent>(COLL_ENTRIES);
  const eventsDB = await database.getCollection<IEvent>(COLL_EVENTS);

  // fetch a user cursor
  const predicate = userPKToFetch ? { userPK: userPKToFetch } : {}
  const userCursor = usersDB.find(predicate).sort({$natural: -1});
  const users = await userCursor.toArray();

  // loop every user fetch new content for all his skapps
  // NOTE: the skapp list is updated by another cron
  let added = 0;
  for (let user of users) {
    // refetch user (TODO: handle better, this is to avoid lock race conditions)
    user = await usersDB.findOne({ userPK: user.userPK })

    const { userPK, newContentLockedAt } = user;
    if (newContentLockedAt && !exceedsLockTime(newContentLockedAt)) {
      console.log(`${new Date().toLocaleString()}: ${user.userPK} skip fetch new content entries, still locked`);
      continue;
    }

    // lock user
    await usersDB.updateOne(
      { userPK },
      { $set: { newContentLockedAt: new Date() } }
    )

    // fetch new content for this user
    try {
      const promises = [];
      for (const skapp of user.skapps) {
        const promise = throttle(fetchEntries.bind(
          null,
          client,
          usersDB,
          entriesDB,
          user,
          skapp
        ))()

        // catch unhandled promise rejections but don't handle the error, we'll
        // process the error when all promises were settled
        //
        // tslint:disable-next-line: no-empty
        promise.catch((err) => { if (DEBUG_ENABLED) { console.log(err.message) }})
        promises.push(promise)
      }

      // wait for all promises to be settled
      added += await settlePromises(
        eventsDB,
        EventType.FETCHNEWCONTENT_ERROR,
        promises,
        'fetchNewContent' // context for console.log
      )
    } finally {
      // unlock the user
      await usersDB.updateMany(
        { userPK },
        { $set: { newContentLockedAt: null } }
      )
    }
  }

  return added;
}

export async function fetchEntries(
  client: SkynetClient,
  userDB: Collection<IUser>,
  entriesDB: Collection<IContent>,
  user: IUser,
  skapp: string
): Promise<number> {
  let entries: IContent[];
  let operations: BulkWriteOperation<IContent>[] = [];

  // grab some info from the user object
  const { userPK } = user;
  let{
    newContentCurrPage,
    newContentCurrNumEntries,
    cachedDataLinks,
  } = user;

  const currPage = newContentCurrPage[skapp] || 0;
  const currOffset = newContentCurrNumEntries[skapp] || 0;

  // build the index path
  const domain = CONTENTRECORD_DAC_DATA_DOMAIN;
  const indexPath = `${domain}/${skapp}/newcontent/index.json`

  // fetch the index
  const { cached, data: index, dataLink: indexDataLink } = await downloadFile<IIndex>(
    client,
    userPK,
    indexPath,
    cachedDataLinks[indexPath]
  )
  if (!index || cached) {
    return 0; // no file found or no changes since last download
  }

  // download pages up until curr page
  const { currPageNumber, currPageNumEntries } = index;
  for (let p = Number(currPage); p < currPageNumber; p++) {
    const path = `${domain}/${skapp}/newcontent/page_${p}.json`;
    [entries,] = await downloadNewEntries(
      domain,
      EntryType.NEWCONTENT,
      client,
      userPK,
      skapp,
      path,
      cachedDataLinks[path]
    )
    for (const entry of entries) {
      operations.push({ insertOne: { document: entry }})
    }
  }

  // build the current page path
  const currPagePath = `${domain}/${skapp}/newcontent/page_${currPageNumber}.json`;

  // download entries up until curr offset
  let currPageDataLink: DataLink;
  [entries, currPageDataLink] = await downloadNewEntries(
    CONTENTRECORD_DAC_DATA_DOMAIN,
    EntryType.NEWCONTENT,
    client,
    userPK,
    skapp,
    currPagePath,
    cachedDataLinks[currPagePath],
    Number(currOffset)
  )
  for (const entry of entries) {
    operations.push({ insertOne: { document: entry }})
  }

  // insert entries
  const numEntriesAdded = operations.length
  if (numEntriesAdded) {
    await entriesDB.bulkWrite(operations)
  }

  // refresh user before updates
  user = await userDB.findOne({ userPK })
  newContentCurrPage = user.newContentCurrPage
  newContentCurrNumEntries = user.newContentCurrNumEntries
  cachedDataLinks = user.cachedDataLinks

  // update user with new props
  newContentCurrPage[skapp] = currPageNumber;
  newContentCurrNumEntries[skapp] = currPageNumEntries;
  cachedDataLinks[indexPath] = indexDataLink;
  cachedDataLinks[currPagePath] = currPageDataLink;
  await userDB.updateOne(
    { userPK },
    {
      $set: {
        newContentCurrPage,
        newContentCurrNumEntries,
        cachedDataLinks,
      }  
    }
  )

  return numEntriesAdded;
}
