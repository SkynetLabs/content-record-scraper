import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { SKYNET_PORTAL_URL } from '../consts';
import { COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { EventType, IEvent, IUser } from '../database/types';
import { Throttle } from './types';
import { settlePromises } from './utils';

const DATAKEY_PROFILE = "profileIndex"

// fetchSkyIDUserProfiles is a simple scraping algorithm that scrapes user
// profiles for all users.
export async function fetchSkyIDUserProfiles(throttle: Throttle<number>): Promise<number> {
  // create a client
  const client = new SkynetClient(SKYNET_PORTAL_URL);
  
  // create a connection with the database and fetch the users DB
  const db = await MongoDB.Connection();
  const usersDB = await db.getCollection<IUser>(COLL_USERS);
  const eventsDB = await db.getCollection<IEvent>(COLL_EVENTS);

  // fetch a user cursor
  const userCursor = usersDB.find();

  // loop every user and kickstart an indexation
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();
    const promise = throttle(fetchUserProfiles.bind(
      null,
      client,
      usersDB,
      user.userPK,
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
    EventType.FETCHSKYIDUSERPROFILES_ERROR,
    promises,
    'fetchSkyIDUserProfiles' // context for console.log
  )
}

async function fetchUserProfiles(
  client: SkynetClient,
  userDB: Collection<IUser>,
  userPK: string,
): Promise<number> {
  // fetch sky ID profile
  const response = await client.db.getJSON(userPK, DATAKEY_PROFILE)
  if (!response || !response.data) {
    return 0
  }

  const { modifiedCount } = await userDB.updateOne(
    { userPK },
    { $set: { skyIDProfile: response.data } }
  )
  return modifiedCount;
}
