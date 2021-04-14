import { BulkWriteOperation, Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CR_DATA_DOMAIN, SKYNET_PORTAL_URL } from '../consts';
import { COLL_ENTRIES, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { EntryType, IContent, IUser } from '../database/types';
import { IIndex } from './types';
import { downloadFile, downloadNewEntries } from './utils';

// fetchNewContent is a simple scraping algorithm that scrapes all known users
// for new content entries.
export async function fetchNewContent(): Promise<void> {
  // create a client
  const client = new SkynetClient(SKYNET_PORTAL_URL);
  
  // create a connection with the database and fetch all collections
  const db = await MongoDB.Connection();
  const usersDB = await db.getCollection<IUser>(COLL_USERS);
  const entriesDB = await db.getCollection<IContent>(COLL_ENTRIES);

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
        entriesDB,
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
  entriesDB: Collection<IContent>,
  user: IUser,
  skapp: string
): Promise<void> {
  let entries: IContent[];
  let operations: BulkWriteOperation<IContent>[];

  // define some variables
  const domain = CR_DATA_DOMAIN;
  const path =`${domain}/${skapp}/newcontent/index.json`
  const userPK = user.pubkey

  // grab some info from the user object
  const {
    newContentCurrPage: currPage,
    newContentCurrNumEntries: currOffset
  } = user;

  // fetch the index
  const index = await downloadFile<IIndex>(client, userPK, path)

  // download pages up until curr page
  for (let p = Number(currPage); p < index.currPageNumber; p++) {
    entries = await downloadNewEntries(
      EntryType.NEWCONTENT,
      client,
      user.pubkey,
      skapp,
      `${domain}/${skapp}/newcontent/page_${p}.json`
    )
    for (const entry of entries) {
      operations.push({ insertOne: { document: entry }})
    }
  }

  // download entries up until curr offset
  entries = await downloadNewEntries(
    EntryType.NEWCONTENT,
    client,
    user.pubkey,
    skapp,
    `${domain}/${skapp}/newcontent/page_${index.currPageNumber}.json`,
    Number(currOffset)
  )
  for (const entry of entries) {
    operations.push({ insertOne: { document: entry }})
  }

  // insert entries
  const numEntries = operations.length
  if (numEntries) {
    console.log(`${numEntries} new content entries found for user ${user.pubkey}`)
    await entriesDB.bulkWrite(operations)
  }

  // update the user state
  await userDB.updateOne({ _id: user._id }, {
    $set: {
      newContentCurrPage: index.currPageNumber,
      newContentCurrNumEntries: index.currPageNumEntries,
    }
  })
}
