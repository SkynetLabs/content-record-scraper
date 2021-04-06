import { BulkWriteOperation, Collection, ObjectId } from 'mongodb';
import {SkynetClient} from 'skynet-js'
import { CR_DATA_DOMAIN, SKYNET_PORTAL_URL } from '../consts';
import { COLL_CONTENT, COLL_INTERACTIONS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { IContent, IUser } from '../database/types';
import { IIndex, IPage, IRawEntry } from './types';

// fetchEntries is a simple scraping algorithm that:
//
// - loops over all known users and downloads their skapp dict
// - for every user loop over all known skapps
// - for every skapp download all known index files
// - update the user's state with the updated offsets
// - if we find the user has new entries, download them and update our state
export async function fetchEntries(): Promise<void> {
  const start = new Date();
  console.log(`Iteration started at ${start}.`)

  // create a client
  const client = new SkynetClient(SKYNET_PORTAL_URL);
  
  // create a connection with the database and fetch all collections
  const db = await MongoDB.Connection();
  const usersDB = await db.getCollection<IUser>(COLL_USERS);
  const contentDB = await db.getCollection<IContent>(COLL_CONTENT);
  const interactionsDB = await db.getCollection<IContent>(COLL_INTERACTIONS);

  // fetch a user cursor
  const userCursor = usersDB.find();

  // loop every user and kickstart an indexation
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();
    for (const skapp of user.skapps) {
      // update new content
      promises.push(fetchNewContent(
        client,
        usersDB,
        contentDB,
        user,
        skapp
      ))

      // update new interactions
      promises.push(fetchNewInteractions(
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
  const end = new Date()
  const elapsed = end.getTime() - start.getTime();
  console.log(`Iteration ened at ${end}, took ${elapsed}ms to complete.`)
}

async function fetchNewContent(
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
  const index = await client.db.getJSON(userPK, path) as unknown as IIndex;

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
  await contentDB.bulkWrite(operations)

  // update the user state
  await userDB.updateOne({ _id: user._id }, {
    $set: {
      newContentCurrPage: index.currPageNumber,
      newContentCurrNumEntries: index.currPageNumEntries,
    }
  })
}

async function fetchNewInteractions(
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
  const index = await client.db.getJSON(userPK, path) as unknown as IIndex;

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
  await interactionsDB.bulkWrite(operations)

  // update the user state
  await userDB.updateOne({ _id: user._id }, {
    $set: {
      contentInteractionsCurrPage: index.currPageNumber,
      contentInteractionsNumEntries: index.currPageNumEntries,
    }
  })
}

async function downloadNewEntries(
  client: SkynetClient,
  user: string,
  skapp: string,
  path: string,
  offset: number = 0
): Promise<IContent[]> {
  const page = await client.db.getJSON(user, path) as unknown as IPage<IRawEntry>;
  return page.entries.slice(offset).map(el => {
    return {
      _id: new ObjectId(),
      user,
      skapp,
      skylink: el.content,
      metadata: el.metadata,
      created: new Date(el.timestamp),
    }
  })
}
