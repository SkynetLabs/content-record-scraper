import { BulkWriteOperation, Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { DEBUG_ENABLED, FEED_DAC_DATA_DOMAIN } from '../consts';
import { COLL_ENTRIES, COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { DataLink, EntryType, EventType, IContent, IEvent, IIndex, IUser, Throttle } from '../types';
import { downloadFile, downloadNewEntries, exceedsLockTime, settlePromises } from './utils';

// fetchComments is a simple scraping algorithm that scrapes all known users
// for new comments from the Feed DAC
export async function fetchComments(database: MongoDB, client: SkynetClient, throttle: Throttle<number>, userPKToFetch?: string): Promise<number> {
  // fetch all collections
  const usersDB = await database.getCollection<IUser>(COLL_USERS);
  const entriesDB = await database.getCollection<IContent>(COLL_ENTRIES);
  const eventsDB = await database.getCollection<IEvent>(COLL_EVENTS);

  // fetch a user cursor
  const predicate = userPKToFetch ? { userPK: userPKToFetch } : {}
  const userCursor = usersDB.find(predicate).sort({ $natural: -1 });
  const users = await userCursor.toArray();

  // loop every user fetch new comments for all his skapps
  let added = 0;
  for (const user of users) {
    const { userPK, commentsLockedAt } = user
    if (commentsLockedAt && !exceedsLockTime(commentsLockedAt)) {
      console.log(`${new Date().toLocaleString()}: ${userPK} skip fetch comment entries, still locked`);
      continue;
    }

    // lock user
    await usersDB.updateOne(
      { userPK },
      { $set: { commentsLockedAt: new Date() } }
    )
    
    // fetch comments for this user
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
        EventType.FETCHCOMMENTS_ERROR,
        promises,
        'fetchComments' // context for console.log
      )
    } finally {
      // unlock the user
      await usersDB.updateMany(
        { userPK },
        { $set: { commentsLockedAt: null } }
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
  let {
    commentsCurrPage,
    commentsCurrNumEntries,
    cachedDataLinks,
  } = user;

  const currPage = commentsCurrPage[skapp] || 0;
  const currOffset = commentsCurrNumEntries[skapp] || 0;
  
  // build the index path
  const domain = FEED_DAC_DATA_DOMAIN;
  const indexPath = `${domain}/${skapp}/comments/index.json`

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
    const path = `${domain}/${skapp}/comments/page_${p}.json`;
    [entries,] = await downloadNewEntries(
      FEED_DAC_DATA_DOMAIN,
      EntryType.COMMENT,
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
  const currPagePath = `${domain}/${skapp}/comments/page_${currPageNumber}.json`;

  // download entries up until curr offset
  let currPageDataLink: DataLink;
  [entries, currPageDataLink] = await downloadNewEntries(
    FEED_DAC_DATA_DOMAIN,
    EntryType.COMMENT,
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
  commentsCurrPage = user.commentsCurrPage
  commentsCurrNumEntries = user.commentsCurrNumEntries
  cachedDataLinks = user.cachedDataLinks
  
  // update user with new props
  commentsCurrPage[skapp] = currPageNumber;
  commentsCurrNumEntries[skapp] = currPageNumEntries;
  cachedDataLinks[indexPath] = indexDataLink;
  cachedDataLinks[currPagePath] = currPageDataLink;
  await userDB.updateOne(
    { userPK },
    {
      $set: {
        commentsCurrPage,
        commentsCurrNumEntries,
        cachedDataLinks
      }  
    }
  )

  return numEntriesAdded
}
