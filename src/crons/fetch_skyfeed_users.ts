import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { upsertUser } from '../database/utils';
import { EventType, IDictionary, IEvent, IUser, Throttle } from '../types';
import { settlePromises } from './utils';

const DATAKEY_FOLLOWING = "skyfeed-following"
const DATAKEY_FOLLOWERS = "skyfeed-followers"

// fetchSkyFeedUsers is a simple scraping algorithm that scrapes all known users
// from skyfeed.
export async function fetchSkyFeedUsers(client: SkynetClient, throttle: Throttle<number>): Promise<number> {
  // create a connection with the database and fetch the users DB
  const db = await MongoDB.Connection();
  const userDB = await db.getCollection<IUser>(COLL_USERS);
  const eventsDB = await db.getCollection<IEvent>(COLL_EVENTS);

  // fetch all known user pubkeys
  const usersResult = await userDB.aggregate<{users: string[]}>([
    {
      $group:
      {
        _id: null,
        users: { $addToSet: '$userPK' }
      }
    }
  ]).toArray()

  // extract into an array
  let users: string[] = []
  if (usersResult.length && usersResult[0].users) {
    users = usersResult[0].users
  }

  // turn into a user map
  const userMap = {};
  for (const userPK of users) {
    userMap[userPK] = true;
  }

  // loop every user fetch his followers and following
  const promises = [];
  for (const userPK of users) {
    const promise = throttle(fetchUsers.bind(
      null,
      client,
      userDB,
      userMap,
      userPK
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
    EventType.FETCHSKYFEEDUSERS_ERROR,
    promises,
    'fetchSkyFeedUsers' // context for console.log
  )
}

async function fetchUsers(
  client: SkynetClient,
  userDB: Collection<IUser>,
  userMap: IDictionary<object>,
  userPK: string,
): Promise<number> {
  // fetch user profile
  const user = await userDB.findOne({ userPK })
  if (!user) {
    return 0;
  }

  const profile = user.skyIDProfile
  if (!profile) {
    return 0;
  }

  // sanity check skyfeed is listed in the user's dapps
  if (!profile.dapps.skyfeed) {
    throw new Error(`Skyfeed not in profile for user '${userPK}'`)
  }

  // fetch users' followers and following
  const publicKey = profile.dapps.skyfeed.publicKey;
  const following = await client.db.getJSON(publicKey, DATAKEY_FOLLOWING)
  const followers = await client.db.getJSON(publicKey, DATAKEY_FOLLOWERS)
  const relationsMap = { ...following.data, ...followers.data }
  const relations = Object.keys(relationsMap).map(String);

  // find out which users are new
  const discovered = [];
  for (const relation of relations) {
    if (!userMap[relation]) {
      discovered.push(relation)
    }
  }

  // upsert the new users
  let total = 0;
  for (const relation of discovered) {
    if (await upsertUser(userDB, relation)) {
      total++;
    }
  }

  return total;
}
