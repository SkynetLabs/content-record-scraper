import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js'
import { CR_DATA_DOMAIN } from '../consts';
import { COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { IUser } from '../database/types';
import { IDictionary } from './types';

// fetchSkapps is a simple scraping algorithm that:
//
// - loops over all known users and downloads their skapp dict
// - for every user loop over all known skapps
// - for every skapp download all known index files
// - update the user's state with the updated offsets
// - if we find the user has new entries, download them and update our state
export async function fetchSkapps(): Promise<void> {
  const start = new Date();
  console.log(`Iteration started at ${start}.`)

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
  // TODO: want to use Promise.allSettled but can't get it to work
  await Promise.all(promises)
  const end = new Date()
  const elapsed = end.getTime() - start.getTime();
  console.log(`Iteration ened at ${end}, took ${elapsed}ms to complete.`)
}

async function fetchNewSkapps(
  client: SkynetClient,
  userDB: Collection<IUser>,
  user: IUser,
): Promise<void> {
  // define some variables
  const domain = CR_DATA_DOMAIN;
  const path =`${domain}/skapps.json`
  const userPK = user.pubkey

  // map all the skapnames
  const map = {};
  for (const skapp of user.skapps) {
    map[skapp] = true
  }
  
  // download the dictionary
  const dict = await client.db.getJSON(userPK, path) as unknown as IDictionary;
  for (const skapp of Object.keys(dict)) {
    if (!map[skapp]) {
      user.skapps.push(skapp)
    }
  }

  // update the user object
  await userDB.updateOne({ _id: user._id }, { $set: { skapps: user.skapps }})
}
