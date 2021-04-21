import { BulkWriteOperation, Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CR_DATA_DOMAIN, SKYNET_PORTAL_URL } from '../consts';
import { COLL_ENTRIES, COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { EntryType, EventType, IContent, IEvent, IUser } from '../database/types';
import { IIndex } from './types';
import { downloadFile, downloadNewEntries, settlePromises, sleep } from './utils';

// fetchInteractions is a simple scraping algorithm that scrapes all known users
// for content interaction entries.
export async function fetchInteractions(): Promise<number> {
  // create a client
  const client = new SkynetClient(SKYNET_PORTAL_URL);
  
  // create a connection with the database and fetch all collections
  const db = await MongoDB.Connection();
  const usersDB = await db.getCollection<IUser>(COLL_USERS);
  const entriesDB = await db.getCollection<IContent>(COLL_ENTRIES);
  const eventsDB = await db.getCollection<IEvent>(COLL_EVENTS);
  
  // fetch a user cursor
  const userCursor = usersDB.find();

  // loop every user fetch new interactions for all his skapps
  // NOTE: the skapp list is updated by another cron
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();
    for (const skapp of user.skapps) {
      const promise = fetchEntries(
        client,
        usersDB,
        entriesDB,
        user,
        skapp
      )

      // catch unhandled promise rejections but don't handle the error, we'll
      // process the error when all promises were settled
      //
      // tslint:disable-next-line: no-empty
      promise.catch(() => {})
      promises.push(promise)      

      // TODO: improve
      // avoid being rate limited
      if (promises.length && promises.length % 10 === 0) {
        await sleep(1000)
      }
    }
  }

  // wait for all promises to be settled
  return await settlePromises(
    eventsDB,
    EventType.FETCHINTERACTIONS_ERROR,
    promises,
    'fetchInteractions' // context for console.log
  )
}

async function fetchEntries(
  client: SkynetClient,
  userDB: Collection<IUser>,
  entriesDB: Collection<IContent>,
  user: IUser,
  skapp: string
): Promise<number> {
  let entries: IContent[];
  let operations: BulkWriteOperation<IContent>[] = [];
  
  // define some variables
  const domain = CR_DATA_DOMAIN;
  const path =`${domain}/${skapp}/interactions/index.json`
  const { userPK } = user

  // grab some info from the user object
  const {
    contentInteractionsCurrPage: currPage,
    contentInteractionsNumEntries: currOffset
  } = user;

  // fetch the index
  const index = await downloadFile<IIndex>(client, userPK, path)
  if (!index) {
    throw new Error(`No interactions index file found for user ${userPK}`)
  }

  // download pages up until curr page
  for (let p = Number(currPage); p < index.currPageNumber; p++) {
    entries = await downloadNewEntries(
      EntryType.INTERACTION,
      client,
      userPK,
      skapp,
      `${domain}/${skapp}/interactions/page_${p}.json`
    )
    for (const entry of entries) {
      operations.push({ insertOne: { document: entry }})
    }
  }

  // download entries up until curr offset
  entries = await downloadNewEntries(
    EntryType.INTERACTION,
    client,
    userPK,
    skapp,
    `${domain}/${skapp}/interactions/page_${index.currPageNumber}.json`,
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

  // update the user state
  await userDB.updateOne({ _id: user._id }, {
    $set: {
      contentInteractionsCurrPage: index.currPageNumber,
      contentInteractionsNumEntries: index.currPageNumEntries,
    }
  })

  return numEntries;
}
