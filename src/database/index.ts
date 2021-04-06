import { MongoDB } from "./mongodb"

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
  await mongo.getCollection(COLL_USERS)
  await mongo.ensureIndex(COLL_USERS, 'user')
  
  console.log('DB initialized.')
  return mongo;
}
