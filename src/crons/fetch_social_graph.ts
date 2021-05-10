import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { DEBUG_ENABLED, SOCIAL_DAC_DATA_DOMAIN } from '../consts';
import { COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { upsertUser } from '../database/utils';
import { EventType, IDictionary, IEvent, IUser, IUserRelations, Throttle } from '../types';
import { downloadFile, settlePromises } from './utils';

const DATAKEY_FOLLOWING = "following"

// fetchSocialGraph is a simple scraping algorithm that scrapes the social DAC
// to fetch the entire user graph and scrape all users.
export async function fetchSocialGraph(database: MongoDB, client: SkynetClient, throttle: Throttle<number>): Promise<number> {
  // fetch all collections
  const usersDB = await database.getCollection<IUser>(COLL_USERS);
  const eventsDB = await database.getCollection<IEvent>(COLL_EVENTS);

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
  const userCursor = usersDB.find().sort({$natural: -1});
  const userEntities = await userCursor.toArray()

  // loop every user and kickstart an indexation
  let added = 0;
  for (const user of userEntities) {
    const promises = [];
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
      promise.catch((err) => { if (DEBUG_ENABLED) { console.log(err.message) }})
      promises.push(promise)
    }

    // wait for all promises to be settled
    added += await settlePromises(
      eventsDB,
      EventType.FETCHSOCIALGRAPH_ERROR,
      promises,
      'fetchSocialGraph' // context for console.log
    )
  }

  return added
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
  const {
    userPK,
    cachedDataLinks
  } = user;
  
  // fetch following
  const path = `${SOCIAL_DAC_DATA_DOMAIN}/${skapp}/${DATAKEY_FOLLOWING}.json`;
  const { cached, data, dataLink } = await downloadFile<IUserRelations>(
    client,
    userPK,
    path,
    cachedDataLinks[path]
  )
  if (cached || !data) {
    return 0
  }

  // update the datalink on the user if it's a new one
  cachedDataLinks[path] = dataLink;
  user = await userDB.findOne({ userPK })
  await userDB.updateOne(
    { userPK },
    {
      $set: {
        cachedDataLinks: {
          ...user.cachedDataLinks,
          ...cachedDataLinks,
        },
      } }
  )

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
