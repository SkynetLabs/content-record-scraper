import { BulkWriteOperation, Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CR_DATA_DOMAIN, SKYNET_PORTAL_URL } from '../consts';
import { COLL_CONTENT, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { IContent, IUser } from '../database/types';
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
  const contentDB = await db.getCollection<IContent>(COLL_CONTENT);

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
        contentDB,
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
  contentDB: Collection<IContent>,
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
  for (let p = currPage; p < index.currPageNumber; p++) {
    entries = await downloadNewEntries(
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
    client,
    user.pubkey,
    skapp,
    `${domain}/${skapp}/newcontent/page_${index.currPageNumber}.json`,
    currOffset
  )
  for (const entry of entries) {
    operations.push({ insertOne: { document: entry }})
  }

  // insert entries
  const numEntries = operations.length
  if (numEntries) {
    console.log(`${numEntries} new content entries found for user ${user.pubkey}`)
    await contentDB.bulkWrite(operations)
  }

  // update the user state
  await userDB.updateOne({ _id: user._id }, {
    $set: {
      newContentCurrPage: index.currPageNumber,
      newContentCurrNumEntries: index.currPageNumEntries,
    }
  })
}
