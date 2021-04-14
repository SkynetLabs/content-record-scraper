import { Int32 as NumberInt } from 'mongodb'
import { TEST_USER_PUBKEY } from '../consts'
import { MongoDB } from "./mongodb"
import { IUser } from "./types"

export const COLL_ENTRIES = 'entries'
export const COLL_USERS = 'users'

export async function init(): Promise<MongoDB> {
  // connect to the database
  const mongo = await MongoDB.Connection()

  // ensure db schema

  // entries
  await mongo.getCollection(COLL_ENTRIES)
  await mongo.ensureIndex(COLL_ENTRIES, 'type')
  await mongo.ensureIndex(COLL_ENTRIES, 'skapp')
  await mongo.ensureIndex(COLL_ENTRIES, 'skylink')
  await mongo.ensureIndex(COLL_ENTRIES, 'user')

  // users
  const users = await mongo.getCollection<IUser>(COLL_USERS)
  await mongo.ensureIndex(COLL_USERS, 'user', { unique: true })
  
  console.log('DB initialized.')

  // add test user
  try {
    const skapps: string[] = []
    await users.updateOne(
      { pubkey: TEST_USER_PUBKEY },
      {
        $set: {
          pubkey: TEST_USER_PUBKEY,
          skapps,
          newContentCurrPage : new NumberInt(0),
          newContentCurrNumEntries : new NumberInt(0),
          contentInteractionsCurrPage : new NumberInt(0),
          contentInteractionsNumEntries : new NumberInt(0),
        }
      },
      { upsert: true }
    )
  } catch (error) {
    console.log('Failed upserting test user', error);
  }
  
  console.log(`Test user '${TEST_USER_PUBKEY}' inserted.`)

  return mongo;
}
