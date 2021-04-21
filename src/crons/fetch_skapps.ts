import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CR_DATA_DOMAIN } from '../consts';
import { COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { EventType, IEvent, IUser } from '../database/types';
import { IDictionary, Throttle } from './types';
import { downloadFile, settlePromises } from './utils';

// fetchSkapps is a simple scraping algorithm that scrapes all known users
// for new skapps those users have been using.
export async function fetchSkapps(throttle: Throttle<number>): Promise<number> {
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
    const promise = throttle(fetchNewSkapps.bind(
      null,
      client,
      usersDB,
      user,
    ))()

    // catch unhandled promise rejections but don't handle the error, we'll
    // process the error when all promises were settled
    //
    // tslint:disable-next-line: no-empty
    promise.catch(() => {})
    promises.push(promise)
  }

  // wait for all promises to be settled
  return await settlePromises(
    eventsDB,
    EventType.FETCHSKAPPS_ERROR,
    promises,
    'fetchSkapps'
  );
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
  if (!dict) {
    throw new Error(`No skapps file found for user ${userPK}`)
  }

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
      const ncIndex = await downloadFile(client, userPK, ncIndexPath)
      if (!ncIndex) {
        throw new Error(`No NC index file found for user ${userPK}`)
      }
      added++;
      user.skapps.push(skapp)
    } catch (error) {
      // we don't bubble up index files not being found
      console.log(`${new Date().toLocaleString()}: Could not add skapp, failed to download index'`, skapp, error)
    }
  }

  // update the user object
  await userDB.updateOne({ _id: user._id }, { $set: { skapps: user.skapps } })
  
  return added;
}
