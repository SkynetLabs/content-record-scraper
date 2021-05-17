import { BulkWriteOperation, Collection, CollectionBulkWriteOptions } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { DEBUG_ENABLED, FEED_DAC_DATA_DOMAIN } from '../consts';
import { COLL_ENTRIES, COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { DataLink, EntryType, EventType, IContent, IEvent, IIndex, IUser, Throttle } from '../types';
import { downloadFile, downloadNewEntries, exceedsLockTime, settlePromises } from './utils';

// fetchPosts is a simple scraping algorithm that scrapes all known users
// for new posts and re-posts from the Feed DAC
export async function fetchPosts(database: MongoDB, client: SkynetClient, throttle: Throttle<number>, userPKToFetch?: string): Promise<number> {
  // fetch all collections
  const usersDB = await database.getCollection<IUser>(COLL_USERS);
  const entriesDB = await database.getCollection<IContent>(COLL_ENTRIES);
  const eventsDB = await database.getCollection<IEvent>(COLL_EVENTS);

  // fetch a user cursor
  const predicate = userPKToFetch ? { userPK: userPKToFetch } : {}
  const userCursor = usersDB.find(predicate).sort({$natural: -1});
  const users = await userCursor.toArray();

  // loop every user fetch new posts for all his skapps
  let added = 0;
  for (let user of users) {
    // refetch user (TODO: handle better, this is to avoid lock race conditions)
    user = await usersDB.findOne({ userPK: user.userPK })

    const { userPK, postsLockedAt } = user
    if (postsLockedAt && !exceedsLockTime(postsLockedAt)) {
      console.log(`${new Date().toLocaleString()}: ${userPK} skip fetch posts entries, still locked`);
      continue;
    }

    // lock user
    await usersDB.updateOne(
      { userPK },
      { $set: { postsLockedAt: new Date() } }
    )

    // fetch posts for this user
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
        EventType.FETCHPOSTS_ERROR,
        promises,
        'fetchPosts' // context for console.log
      )  
    } finally {
      // unlock the user
      await usersDB.updateMany(
        { userPK },
        { $unset: { postsLockedAt: "" } }
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

  const domain = FEED_DAC_DATA_DOMAIN;

  // grab some info from the user object
  const { userPK } = user;
  let{
    postsCurrPage,
    postsCurrNumEntries,
    cachedDataLinks,
  } = user;

  const currPage = postsCurrPage[skapp] || 0;
  const currOffset = postsCurrNumEntries[skapp] || 0;

  // build the index path
  const indexPath =`${domain}/${skapp}/posts/index.json`

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
    const path = `${domain}/${skapp}/posts/page_${p}.json`;
    [entries,] = await downloadNewEntries(
      FEED_DAC_DATA_DOMAIN,
      EntryType.POST,
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
  const currPagePath = `${domain}/${skapp}/posts/page_${currPageNumber}.json`;
  
  // download entries up until curr offset
  let currPageDataLink: DataLink;
  [entries, currPageDataLink] = await downloadNewEntries(
    domain,
    EntryType.POST,
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
    // NOTE that the library does not support 'checkKeys', but the driver
    // properly passes it to the MongoDB engine
    await entriesDB.bulkWrite(operations, { checkKeys: false } as CollectionBulkWriteOptions)
  }

  // refresh user before updates
  user = await userDB.findOne({ userPK })
  postsCurrPage = user.postsCurrPage
  postsCurrNumEntries = user.postsCurrNumEntries
  cachedDataLinks = user.cachedDataLinks

  // update user with new props
  postsCurrPage[skapp] = currPageNumber;
  postsCurrNumEntries[skapp] = currPageNumEntries;
  cachedDataLinks[indexPath] = indexDataLink;
  cachedDataLinks[currPagePath] = currPageDataLink;
  await userDB.updateOne(
    { userPK },
    {
      $set: {
        postsCurrPage,
        postsCurrNumEntries,
        cachedDataLinks
      }  
    }
  )

  return numEntriesAdded;
}
