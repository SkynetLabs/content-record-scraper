import { BulkWriteOperation, Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CONTENTRECORD_DAC_DATA_DOMAIN, DEBUG_ENABLED } from '../consts';
import { COLL_ENTRIES, COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { DataLink, EntryType, EventType, IContent, IEvent, IIndex, IUser, Throttle } from '../types';
import { downloadFile, downloadNewEntries, settlePromises } from './utils';

// fetchNewContent is a simple scraping algorithm that scrapes all known users
// for new content entries.
export async function fetchNewContent(database: MongoDB, client: SkynetClient, throttle: Throttle<number>): Promise<number> {
  // fetch all collections
  const usersDB = await database.getCollection<IUser>(COLL_USERS);
  const entriesDB = await database.getCollection<IContent>(COLL_ENTRIES);
  const eventsDB = await database.getCollection<IEvent>(COLL_EVENTS);

  // fetch a user cursor
  const userCursor = usersDB.find();

  // loop every user fetch new interactions for all his skapps
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
      promise.catch((err) => { if (DEBUG_ENABLED) { console.log(err.status, err.message) }})
      promises.push(promise)
    }
  }

  // wait for all promises to be settled
  return await settlePromises(
    eventsDB,
    EventType.FETCHNEWCONTENT_ERROR,
    promises,
    'fetchNewContent' // context for console.log
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

  // grab some info from the user object
  const {
    userPK,
    newContentCurrPage: currPage,
    newContentCurrNumEntries: currOffset,
    cachedDataLinks,
  } = user;

  // build the index path
  const domain = CONTENTRECORD_DAC_DATA_DOMAIN;
  let path =`${domain}/${skapp}/newcontent/index.json`

  // fetch the index
  const { cached, data: index, dataLink } = await downloadFile<IIndex>(
    client,
    userPK,
    path,
    cachedDataLinks[path]
  )
  if (!index || cached) {
    return 0; // no file found or no changes since last download
  }

  const { currPageNumber, currPageNumEntries } = index;

  // update the cached data link for the index page
  cachedDataLinks[path] = dataLink;

  // download pages up until curr page
  for (let p = Number(currPage); p < currPageNumber; p++) {
    // build the page path
    path = `${domain}/${skapp}/newcontent/page_${p}.json`;

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
  path = `${domain}/${skapp}/newcontent/page_${currPageNumber}.json`;

  // download entries up until curr offset
  let currPageDataLink: DataLink;
  [entries, currPageDataLink] = await downloadNewEntries(
    CONTENTRECORD_DAC_DATA_DOMAIN,
    EntryType.NEWCONTENT,
    client,
    userPK,
    skapp,
    path,
    cachedDataLinks[path],
    Number(currOffset)
  )
  for (const entry of entries) {
    operations.push({ insertOne: { document: entry }})
  }

  // update the cached data link for the current page
  cachedDataLinks[path] = currPageDataLink;

  // insert entries
  const numEntries = operations.length
  if (numEntries) {
    await entriesDB.bulkWrite(operations)
  }

  // update the user state
  user = await userDB.findOne({ userPK })
  await userDB.updateOne(
    { userPK },
    {
      $set: {
        newContentCurrPage: currPageNumber,
        newContentCurrNumEntries: currPageNumEntries,
        cachedDataLinks: {
          ...user.cachedDataLinks,
          ...cachedDataLinks,
        },
      }
    }
  )
  return numEntries
}
