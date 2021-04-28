import { TEST_USER_PUBKEYS, EVENT_EXPIRY_IN_S } from '../consts';
import { MongoDB } from "./mongodb"
import { IUser } from "../types"
import { upsertUser } from './utils'

export const COLL_ENTRIES = 'entries'
export const COLL_USERS = 'users'
export const COLL_EVENTS = 'events'

export async function init(): Promise<MongoDB> {
  // connect to the database
  const mongo = await MongoDB.Connection()

  // ensure db schema

  // entries
  await mongo.getCollection(COLL_ENTRIES)
  await mongo.ensureIndex(COLL_ENTRIES, 'type')
  await mongo.ensureIndex(COLL_ENTRIES, 'skapp')
  await mongo.ensureIndex(COLL_ENTRIES, 'skylink')
  await mongo.ensureIndex(COLL_ENTRIES, 'userPK')

  // events
  await mongo.getCollection(COLL_EVENTS)
  const ttlIndexOpts = { expireAfterSeconds: EVENT_EXPIRY_IN_S }
  await mongo.ensureIndex(COLL_EVENTS, 'createdAt', ttlIndexOpts)

  // users
  const users = await mongo.getCollection<IUser>(COLL_USERS)
  await mongo.ensureIndex(COLL_USERS, 'userPK', { unique: true })
  
  console.log(`${new Date().toLocaleString()}: DB initialized.`)

  // add test users
  for (const testUserPK of TEST_USER_PUBKEYS) {
    try {
      if (await upsertUser(users, testUserPK)) {
        console.log(`${new Date().toLocaleString()}: Upserted user '${testUserPK}'.`)
      }
    } catch (error) {
      console.log(`${new Date().toLocaleString()}: Failed upserting test user '${testUserPK}'`, error);
    }
  }

  return mongo;
}
