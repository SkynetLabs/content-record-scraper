import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js'
import { CR_DATA_DOMAIN } from '../consts';
import { COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { IUser } from '../database/types';
import { IDictionary } from './types';
import { downloadFile } from './utils';

// fetchSkapps is a simple scraping algorithm that scrapes all known users
// for new skapps those users have been using.
export async function fetchSkapps(): Promise<number> {
  // create a client
  const client = new SkynetClient("https://siasky.net");
  
  // create a connection with the database and fetch all collections
  const db = await MongoDB.Connection();
  const usersDB = await db.getCollection<IUser>(COLL_USERS);

  // fetch a user cursor
  const userCursor = usersDB.find();

  // loop every user and kickstart an indexation
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();
    promises.push(fetchNewSkapps(
      client,
      usersDB,
      user,
    ))
  }

  // wait for all promises to be settled
  const results = await Promise.allSettled<number[]>(promises)
  let added = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      added += result.value;
    } else {
      console.log('fetchSkapps err: ', result.reason)
    }
  }
  return added
}

async function fetchNewSkapps(
  client: SkynetClient,
  userDB: Collection<IUser>,
  user: IUser,
): Promise<number> {
  // define some variables
  const domain = CR_DATA_DOMAIN;
  const path =`${domain}/skapps.json`
  const { userPK } = user

  // map all the skapnames
  const map = {};
  for (const skapp of user.skapps) {
    map[skapp] = true
  }
  
  // download the dictionary
  let added = 0;
  const dict = await downloadFile<IDictionary>(client, userPK, path)
  for (const skapp of Object.keys(dict)) {
    if (!map[skapp]) {
      added++;
      user.skapps.push(skapp)
    }
  }

  // update the user object
  await userDB.updateOne({ _id: user._id }, { $set: { skapps: user.skapps } })
  
  return added;
}
