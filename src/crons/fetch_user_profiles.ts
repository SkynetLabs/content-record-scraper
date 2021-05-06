import { Collection } from 'mongodb';
import { SignedRegistryEntry, SkynetClient } from 'skynet-js';
import { DEBUG_ENABLED, MYSKY_PROFILE_DAC_DATA_DOMAIN } from '../consts';
import { COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { EventType, IEvent, IProfileIndex, IUser, IUserProfile, Throttle } from '../types';
import { downloadFile, settlePromises } from './utils';

const DATAKEY_MYSKY_PROFILE = "profileIndex"
const DATAKEY_SKYID_PROFILE = "profile"

// fetchUserProfiles is a simple scraping algorithm that scrapes user
// profiles for all users.
export async function fetchUserProfiles(database: MongoDB, client: SkynetClient, throttle: Throttle<number>): Promise<number> {
  // fetch all collections
  const usersDB = await database.getCollection<IUser>(COLL_USERS);
  const eventsDB = await database.getCollection<IEvent>(COLL_EVENTS);

  // fetch a user cursor
  const userCursor = usersDB.find().sort({$natural: -1});

  // loop every user and kickstart an indexation
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();
    const promise = throttle(fetchProfiles.bind(
      null,
      client,
      usersDB,
      user,
    ))()

    // catch unhandled promise rejections but don't handle the error, we'll
    // process the error when all promises were settled
    //
    // tslint:disable-next-line: no-empty
    promise.catch((err) => { if (DEBUG_ENABLED) { console.log(err.message) }})
    promises.push(promise)
  }

  // wait for all promises to be settled
  return await settlePromises(
    eventsDB,
    EventType.FETCHUSERPROFILES_ERROR,
    promises,
    'fetchUserProfiles' // context for console.log
  )
}

export async function fetchProfiles(
  client: SkynetClient,
  userDB: Collection<IUser>,
  user: IUser,
): Promise<number> {
  let found = 0;

  // grab some info from the user object
  const {
    userPK,
    cachedDataLinks,
    mySkyProfile: currentMySkyProfile
  } = user;

  // fetch MySky profile
  const path = `${MYSKY_PROFILE_DAC_DATA_DOMAIN}/${DATAKEY_MYSKY_PROFILE}.json`;
  const { cached, data: updatedMySkyProfile, dataLink } = await downloadFile<IProfileIndex>(
    client,
    userPK,
    path,
    cachedDataLinks[path]
  )

  // if found, persist it
  if (!cached && updatedMySkyProfile) {

    // check whether the update is indeed an update, by ensuring the history log
    // got appended to
    if (currentMySkyProfile && currentMySkyProfile.historyLog) {
      const currentHistoryCount = currentMySkyProfile.historyLog.length;
      const updatedHistoryCount = updatedMySkyProfile.historyLog.length;
      if (updatedHistoryCount <= currentHistoryCount) {
        throw new Error(`Received profile update with incorrect history log`)
      }
    }

    // update the user and set the new profile and new datalinks
    cachedDataLinks[path] = dataLink;
    const { modifiedCount } = await userDB.updateOne(
      { userPK },
      {
        $set: {
          mySkyProfile: updatedMySkyProfile,
          cachedDataLinks,
        }
      }
    )

    found += modifiedCount

    console.log(`Found new profile for user ${userPK}, ${JSON.stringify(updatedMySkyProfile)}`)
  }

  // fetch SkyID profile
  const response: SignedRegistryEntry = await client.registry.getEntry(
    userPK,
    DATAKEY_SKYID_PROFILE
  )
  if (!response || !response.entry) {
    return found;
  }

  // fetch its contents and try to parse it as JSON
  let skyIDProfile: IUserProfile
  try {
    const content = await client.getFileContent<string>(response.entry.data)
    skyIDProfile = JSON.parse(content.data)
  } catch (error) {
    return found;
  }

  // if found, persist it
  if (skyIDProfile) {
    const { modifiedCount } = await userDB.updateOne(
      { userPK },
      { $set: { skyIDProfile } }
    )
    found += modifiedCount
  }

  return found;
}
