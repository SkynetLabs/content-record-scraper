import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { SKYFEED_SEED_USER_PUBKEY, SKYNET_PORTAL_URL } from '../consts';
import { COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { IUser } from '../database/types';
import { upsertUser } from '../database/utils';
import { IDictionary, IUserProfile } from './types';

const DATAKEY_PROFILE = "profile"
const DATAKEY_FOLLOWING = "skyfeed-following"
const DATAKEY_FOLLOWERS = "skyfeed-followers"

// fetchSkyFeedUsers is a simple scraping algorithm that scrapes all known users
// from skyfeed.
export async function fetchSkyFeedUsers(): Promise<number> {
  // create a client
  const client = new SkynetClient(SKYNET_PORTAL_URL);
  
  // create a connection with the database and fetch the users DB
  const db = await MongoDB.Connection();
  const userDB = await db.getCollection<IUser>(COLL_USERS);

  // ensure the seed user is in our database
  const inserted = upsertUser(userDB, SKYFEED_SEED_USER_PUBKEY)
  if (inserted) {
    console.log(`${new Date().toLocaleString()}: Skyfeed seed user '${SKYFEED_SEED_USER_PUBKEY}' inserted.`)
  }

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
    promises.push(fetchUsers(
      client,
      userDB,
      userMap,
      userPK
    ))
  }

  // wait for all promises to be settled
  const results = await Promise.allSettled<number[]>(promises)
  let added = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      added += result.value;
    } else {
      console.log(`${new Date().toLocaleString()}: fetchUsers error: '`, result.reason)
    }
  }
  return added
}

async function fetchUsers(
  client: SkynetClient,
  userDB: Collection<IUser>,
  userMap: IDictionary<object>,
  userPK: string,
): Promise<number> {
  // fetch user's profile
  const response = await client.registry.getEntry(userPK, DATAKEY_PROFILE)
  if (!response || !response.entry) {
    throw new Error(`Could not find profile for user '${userPK}'`)
  }

  const content = await client.getFileContent<string>(response.entry.data)
  const profileStr = content.data
  const profile = JSON.parse(profileStr) as IUserProfile
  if (!profile.dapps.skyfeed) {
    throw new Error('Skyfeed not in profile')
  }

  // fetch users' followers and following
  const publicKey = profile.dapps.skyfeed.publicKey;
  const following = await client.db.getJSON(publicKey, DATAKEY_FOLLOWING)
  const followers = await client.db.getJSON(publicKey, DATAKEY_FOLLOWERS)
  const relationsMap = { ...following.data, ...followers.data }
  const relations = Object.keys(relationsMap).map(String);

  // find out which users are new
  const discovered = [];
  for (const user of relations) {
    if (!userMap[user]) {
      discovered.push(user)
    }
  }

  // upsert the new users
  let total = 0;
  for (const user of discovered) {
    if (await upsertUser(userDB, user)) {
      total++;
    }
  }

  return total;
}
