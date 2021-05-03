import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { SOCIAL_DAC_DATA_DOMAIN } from '../consts';
import { COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { upsertUser } from '../database/utils';
import { EventType, IDictionary, IEvent, IUser, IUserRelations, Throttle } from '../types';
import { downloadFile, settlePromises } from './utils';

const DATAKEY_FOLLOWING = "following"

// fetchSocialGraph is a simple scraping algorithm that scrapes the social DAC
// to fetch the entire user graph and scrape all users.
export async function fetchSocialGraph(client: SkynetClient, throttle: Throttle<number>): Promise<number> {
  // create a connection with the database and fetch the users DB
  const db = await MongoDB.Connection();
  const usersDB = await db.getCollection<IUser>(COLL_USERS);
  const eventsDB = await db.getCollection<IEvent>(COLL_EVENTS);

  // fetch all known user pubkeys
  const usersResult = await usersDB.aggregate<{users: string[]}>([
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

  // fetch a user cursor
  const userCursor = usersDB.find();

  // loop every user and kickstart an indexation
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();

    for (const skapp of user.skapps) {
      const promise = throttle(fetchFollowing.bind(
        null,
        client,
        userMap,
        usersDB,
        user,
        skapp
      ))()
  
      // catch unhandled promise rejections but don't handle the error, we'll
      // process the error when all promises were settled
      //
      // tslint:disable-next-line: no-empty
      promise.catch(() => {})
      promises.push(promise)
    }
  }

  // wait for all promises to be settled
  return await settlePromises(
    eventsDB,
    EventType.FETCHSOCIALGRAPH_ERROR,
    promises,
    'fetchSocialGraph' // context for console.log
  )
}

export async function fetchFollowing(
  client: SkynetClient,
  userDict: IDictionary<boolean>,
  userDB: Collection<IUser>,
  user: IUser,
  skapp: string
): Promise<number> {
  let added = 0;

  // grab some variables
  const { userPK, followingDataLinks } = user;

  // fetch following
  const cachedDataLink = followingDataLinks[skapp] || ""
  const path = `${SOCIAL_DAC_DATA_DOMAIN}/${skapp}/${DATAKEY_FOLLOWING}.json`;
  const { data, dataLink } = await downloadFile<IUserRelations>(
    client,
    userPK,
    path,
    cachedDataLink
  )

  // update the datalink on the user if it's a new one
  if (dataLink !== cachedDataLink) {
    followingDataLinks[skapp] = dataLink;
    await userDB.updateOne({ userPK }, {$set: { followingDataLinks }})
  }

  // find all new users and insert a user object into the database
  for (const relUserPK of Object.keys(data.relations)) {
    if (!userDict[relUserPK]) {
      if (await upsertUser(userDB, relUserPK)) {
        added++
      }
    }
  }
  
  return added;
}
