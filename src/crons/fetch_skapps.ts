import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CONTENTRECORD_DAC_DATA_DOMAIN, FEED_DAC_DATA_DOMAIN } from '../consts';
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
  const { userPK } = user

  // map all the skapnames
  const map = {};
  for (const skapp of user.skapps) {
    map[skapp] = true
  }
  
  let added = 0;
  const dacDataDomains = [CONTENTRECORD_DAC_DATA_DOMAIN, FEED_DAC_DATA_DOMAIN]
  for (const domain of dacDataDomains) {
    // download the dictionary
    const path =`${domain}/skapps.json`
    const dict = (await downloadFile<IDictionary<string | boolean>>(
      client,
      userPK,
      path
    )) || {};
  
    // loop all of the skapps and add the ones we're missing
    for (const skapp of Object.keys(dict)) {
      if (!map[skapp]) {
        added++;
        user.skapps.push(skapp)
      }
    }
  }

  // update the user object if skapps were added
  if (added) {
    await userDB.updateOne({ _id: user._id }, { $set: { skapps: user.skapps } })
  }
  
  return added;
}
