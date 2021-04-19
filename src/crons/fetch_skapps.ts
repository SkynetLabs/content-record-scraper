import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js'
import { CR_DATA_DOMAIN } from '../consts';
import { COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { EventType, IEvent, IUser } from '../database/types';
import { tryLogEvent } from '../database/utils';
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
  const eventsDB = await db.getCollection<IEvent>(COLL_EVENTS);
  
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
      tryLogEvent(eventsDB, {
          type: EventType.FETCHSKAPPS_ERROR,
          error: result.reason,
          createdAt: new Date(),
      })
      console.log(`${new Date().toLocaleString()}: fetchSkapps error: '`, result.reason)
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
  const dict = await downloadFile<IDictionary<boolean>>(client, userPK, path)
  for (const skapp of Object.keys(dict)) {
    if (map[skapp]) {
      continue; // already exists
    }

    // Try to download the new content index file, if that does not succeed, we
    // don't bother adding the skapp to the users's skapp list. This prevents a
    // lot of excess calls that time out in the other cronjobs.
    //
    // NOTE: this is not an issue because we ensure the file hierarchy, this
    // might change in the future. For now though this is fine.
    try {
      const ncIndexPath = `${CR_DATA_DOMAIN}/${skapp}/newcontent/index.json`
      await downloadFile(client, userPK, ncIndexPath)
      added++;
      user.skapps.push(skapp)
    } catch (error) {
      console.log(`${new Date().toLocaleString()}: Could not add skapp, failed to download index'`, skapp, error)
    }
  }

  // update the user object
  await userDB.updateOne({ _id: user._id }, { $set: { skapps: user.skapps } })
  
  return added;
}
