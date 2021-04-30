import { BulkWriteOperation, Collection, Int32 as NumberInt } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { FEED_DAC_DATA_DOMAIN } from '../consts';
import { COLL_ENTRIES, COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { DataLink, EntryType, EventType, IContent, IEvent, IIndex, IUser, Throttle } from '../types';
import { downloadFile, downloadNewEntries, settlePromises, shouldRun } from './utils';

// fetchPosts is a simple scraping algorithm that scrapes all known users
// for new posts and re-posts from the Feed DAC
export async function fetchPosts(client: SkynetClient, throttle: Throttle<number>): Promise<number> {
  // create a connection with the database and fetch all collections
  const db = await MongoDB.Connection();
  const usersDB = await db.getCollection<IUser>(COLL_USERS);
  const entriesDB = await db.getCollection<IContent>(COLL_ENTRIES);
  const eventsDB = await db.getCollection<IEvent>(COLL_EVENTS);

  // fetch a user cursor
  const userCursor = usersDB.find();

  // loop every user fetch new posts for all his skapps
  // NOTE: the skapp list is updated by another cron
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();
    const { postsConsecNoneFound } = user;

    // skip this user a certain pct of the times if he has been inactive
    const consecNoneFound = Number(postsConsecNoneFound || 0);
    if (!shouldRun(consecNoneFound)) {
      continue;
    }

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
      promise.catch(() => {})
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

  // define some variables
  const domain = FEED_DAC_DATA_DOMAIN;
  const path =`${domain}/${skapp}/posts/index.json`
  const { userPK, postsConsecNoneFound } = user

  // grab some info from the user object
  const {
    postsCurrPage: currPage,
    postsCurrNumEntries: currOffset,
    postsIndexDataLink: cachedIndexDataLink,
    postsCurrPageDataLink: cachedPageDataLink,
  } = user;

  // fetch the index
  const {cached, data: index, dataLink: indexDataLink} = await downloadFile<IIndex>(client, userPK, path, cachedIndexDataLink)
  if (cached) {
    return 0; // no changes since last download
  }
  if (!index) {
    throw new Error(`No posts index file found for user ${userPK}`)
  }

  // download pages up until curr page
  for (let p = Number(currPage); p < index.currPageNumber; p++) {
    [entries,] = await downloadNewEntries(
      domain,
      EntryType.POST,
      client,
      userPK,
      skapp,
      `${domain}/${skapp}/posts/page_${p}.json`,
      cachedPageDataLink
    )
    for (const entry of entries) {
      operations.push({ insertOne: { document: entry }})
    }
  }

  // download entries up until curr offset
  let currPageDataLink: DataLink;
  [entries, currPageDataLink] = await downloadNewEntries(
    domain,
    EntryType.POST,
    client,
    userPK,
    skapp,
    `${domain}/${skapp}/posts/page_${index.currPageNumber}.json`,
    cachedPageDataLink,
    Number(currOffset)
  )
  for (const entry of entries) {
    operations.push({ insertOne: { document: entry }})
  }

  // possibly increment consecutive none found
  let consecNoneFound = Number(postsConsecNoneFound || 0);

  // insert entries
  const numEntries = operations.length
  if (numEntries) {
    consecNoneFound = 0
    await entriesDB.bulkWrite(operations)
  } else {
    consecNoneFound++
  }

  // update the user state
  await userDB.updateOne({ _id: user._id }, {
    $set: {
      postsCurrPage: index.currPageNumber,
      postsCurrNumEntries: index.currPageNumEntries,
      postsConsecNoneFound: new NumberInt(consecNoneFound),
      postsIndexDataLink: indexDataLink,
      postsCurrPageDataLink: currPageDataLink,
    }
  })
  return numEntries
}
