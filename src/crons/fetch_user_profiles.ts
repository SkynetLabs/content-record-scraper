import { Collection } from 'mongodb';
import { SignedRegistryEntry, SkynetClient } from 'skynet-js';
import { MYSKY_PROFILE_DAC_DATA_DOMAIN } from '../consts';
import { COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { EventType, IEvent, IMySkyUserProfile, IUser, IUserProfile, Throttle } from '../types';
import { downloadFile, settlePromises } from './utils';

const DATAKEY_MYSKY_PROFILE = "profileIndex"
const DATAKEY_SKYID_PROFILE = "profile"

// fetchUserProfiles is a simple scraping algorithm that scrapes user
// profiles for all users.
export async function fetchUserProfiles(client: SkynetClient, throttle: Throttle<number>): Promise<number> {
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
    const promise = throttle(fetchProfiles.bind(
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
    EventType.FETCHUSERPROFILES_ERROR,
    promises,
    'fetchUserProfiles' // context for console.log
  )
}

export async function fetchProfiles(
  client: SkynetClient,
  userDB: Collection<IUser>,
  userPK: string,
): Promise<number> {
  let found = 0;
  // fetch MySky profile
  const path = `${MYSKY_PROFILE_DAC_DATA_DOMAIN}/${DATAKEY_MYSKY_PROFILE}.json`;
  const { data: mySkyProfile } = await downloadFile<IMySkyUserProfile>(
    client,
    userPK,
    path
  )

  // if found, persist it
  if (mySkyProfile) {
    const { modifiedCount } = await userDB.updateOne(
      { userPK },
      { $set: { mySkyProfile } }
    )
    found += modifiedCount
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
