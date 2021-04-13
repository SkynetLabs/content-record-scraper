import { BulkWriteOperation, Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CR_DATA_DOMAIN, SKYNET_PORTAL_URL } from '../consts';
import { COLL_INTERACTIONS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { IContent, IUser } from '../database/types';
import { IIndex } from './types';
import { downloadFile, downloadNewEntries } from './utils';

// fetchInteractions is a simple scraping algorithm that scrapes all known users
// for content interaction entries.
export async function fetchInteractions(): Promise<void> {
  // create a client
  const client = new SkynetClient(SKYNET_PORTAL_URL);
  
  // create a connection with the database and fetch all collections
  const db = await MongoDB.Connection();
  const usersDB = await db.getCollection<IUser>(COLL_USERS);
  const interactionsDB = await db.getCollection<IContent>(COLL_INTERACTIONS);

  // fetch a user cursor
  const userCursor = usersDB.find();

  // loop every user fetch new interactions for all his skapps
  // NOTE: the skapp list is updated by another cron
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();
    for (const skapp of user.skapps) {
      promises.push(fetchEntries(
        client,
        usersDB,
        interactionsDB,
        user,
        skapp
      ))
    }
  }

  // wait for all promises to be settled
  // TODO: want to use Promise.allSettled but can't get it to work
  await Promise.all(promises)
}

async function fetchEntries(
  client: SkynetClient,
  userDB: Collection<IUser>,
  interactionsDB: Collection<IContent>,
  user: IUser,
  skapp: string
): Promise<void> {
  let entries: IContent[];
  let operations: BulkWriteOperation<IContent>[];
  
  // define some variables
  const domain = CR_DATA_DOMAIN;
  const path =`${domain}/${skapp}/interactions/index.json`
  const userPK = user.pubkey

  // grab some info from the user object
  const {
    contentInteractionsCurrPage: currPage,
    contentInteractionsNumEntries: currOffset
  } = user;

  // fetch the index
  const index = await downloadFile<IIndex>(client, userPK, path)

  // download pages up until curr page
  for (let p = currPage; p < index.currPageNumber; p++) {
    entries = await downloadNewEntries(
      client,
      user.pubkey,
      skapp,
      `${domain}/${skapp}/interactions/page_${p}.json`
    )
    for (const entry of entries) {
      operations.push({ insertOne: { document: entry }})
    }
  }

  // download entries up until curr offset
  entries = await downloadNewEntries(
    client,
    user.pubkey,
    skapp,
    `${domain}/${skapp}/interactions/page_${index.currPageNumber}.json`,
    currOffset
  )
  for (const entry of entries) {
    operations.push({ insertOne: { document: entry }})
  }

  // insert entries
  const numEntries = operations.length
  if (numEntries) {
    console.log(`${numEntries} new interaction entries found for user ${user.pubkey}`)
    await interactionsDB.bulkWrite(operations)
  }

  // update the user state
  await userDB.updateOne({ _id: user._id }, {
    $set: {
      contentInteractionsCurrPage: index.currPageNumber,
      contentInteractionsNumEntries: index.currPageNumEntries,
    }
  })
}
