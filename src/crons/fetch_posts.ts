import { BulkWriteOperation, Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { DEBUG_ENABLED, FEED_DAC_DATA_DOMAIN } from '../consts';
import { COLL_ENTRIES, COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { DataLink, EntryType, EventType, IContent, IEvent, IIndex, IUser, Throttle } from '../types';
import { downloadFile, downloadNewEntries, settlePromises } from './utils';

// fetchPosts is a simple scraping algorithm that scrapes all known users
// for new posts and re-posts from the Feed DAC
export async function fetchPosts(database: MongoDB, client: SkynetClient, throttle: Throttle<number>): Promise<number> {
  // fetch all collections
  const usersDB = await database.getCollection<IUser>(COLL_USERS);
  const entriesDB = await database.getCollection<IContent>(COLL_ENTRIES);
  const eventsDB = await database.getCollection<IEvent>(COLL_EVENTS);

  // fetch a user cursor
  const userCursor = usersDB.find().sort({$natural: -1});

  // loop every user fetch new posts for all his skapps
  // NOTE: the skapp list is updated by another cron
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();
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
  }

  // wait for all promises to be settled
  return await settlePromises(
    eventsDB,
    EventType.FETCHPOSTS_ERROR,
    promises,
    'fetchPosts' // context for console.log
  )
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
  const {
    userPK,
    postsCurrPage: currPage,
    postsCurrNumEntries: currOffset,
    cachedDataLinks,
  } = user;
  
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
  const numEntries = operations.length
  if (numEntries) {
    await entriesDB.bulkWrite(operations)
  }

  // update the user state, refetch so we don't overwrite cached links
  user = await userDB.findOne({ userPK })
  const cachedDataLinksUpdate = { ...user.cachedDataLinks }
  cachedDataLinksUpdate[indexPath] = indexDataLink;
  cachedDataLinksUpdate[currPagePath] = currPageDataLink;

  // update the user state
  user = await userDB.findOne({ userPK })
  await userDB.updateOne(
    { userPK },
    {
      $set: {
        postsCurrPage: currPageNumber,
        postsCurrNumEntries: currPageNumEntries,
        cachedDataLinks: cachedDataLinksUpdate,
      }
    }
  )
  return numEntries
}
