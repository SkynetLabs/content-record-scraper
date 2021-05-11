import { TEST_USER_PUBKEYS, EVENT_EXPIRY_IN_S } from '../consts';
import { MongoDB } from "./mongodb"
import { EListType, IUser, IList } from '../types';
import { upsertUser } from './utils'

export const COLL_ENTRIES = 'entries'
export const COLL_USERS = 'users'
export const COLL_EVENTS = 'events'
export const COLL_LISTS = 'lists'

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

  // lists
  const lists = await mongo.getCollection<IList>(COLL_LISTS)

  // add initial allow and blocklists
  await lists.updateOne(
    { type: EListType.SKAPP_ALLOWLIST },
    {
      $setOnInsert: {
        type: EListType.SKAPP_ALLOWLIST,
        items: [
          "0008ma52pgm6oac9qrj3fi5a202tcu590bs7es148n5e6mjm78n4it0", // SVGUP
          "0000chsgunr75ulvqcblsc61bag320tf32peqjra2vs8vrob3gj8lp0", // API US.
          "0004m25ifbub93sj9itg9po8ptd78lke2bqhbj3qo4eekd42ocdlh88", // HOW AB.
        ],
      }
    },
    { upsert: true }
  )
  await lists.updateOne(
    { type: EListType.SKAPP_BLOCKLIST },
    {
      $setOnInsert: {
        type: EListType.SKAPP_BLOCKLIST,
        items: [
          "skytter.hns",
          "snew.hns",
        ],
      }
    },
    { upsert: true }
  )
  
  // unlock all users
  await users.updateMany({}, {
    $unset: {
      interactionsLockedAt: "",
      newContentLockedAt: "",
      commentsLockedAt: "",
      postsLockedAt: "",
    }
  })

  console.log(`${new Date().toLocaleString()}: DB initialized.`)
  return mongo;
}
