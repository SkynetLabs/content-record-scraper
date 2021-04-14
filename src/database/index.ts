import { Int32 as NumberInt } from 'mongodb'
import { TEST_USER_PUBKEY } from '../consts'
import { MongoDB } from "./mongodb"
import { IUser } from "./types"

export const COLL_CONTENT = 'content'
export const COLL_INTERACTIONS = 'interactions'
export const COLL_USERS = 'users'

export async function init(): Promise<MongoDB> {
  // connect to the database
  const mongo = await MongoDB.Connection()

  // ensure db schema

  // creations
  await mongo.getCollection(COLL_CONTENT)
  await mongo.ensureIndex(COLL_CONTENT, 'skapp')
  await mongo.ensureIndex(COLL_CONTENT, 'skylink')
  await mongo.ensureIndex(COLL_CONTENT, 'user')

  // interactions
  await mongo.getCollection(COLL_INTERACTIONS)
  await mongo.ensureIndex(COLL_INTERACTIONS, 'skapp')
  await mongo.ensureIndex(COLL_INTERACTIONS, 'skylink')
  await mongo.ensureIndex(COLL_INTERACTIONS, 'user')

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
