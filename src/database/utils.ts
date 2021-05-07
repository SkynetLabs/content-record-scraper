import { Collection } from 'mongodb';
import { isValidUserPK } from '../api/utils';
import { IEvent, IUser } from '../types';

export async function upsertUser(userDB: Collection<IUser>, userPK: string): Promise<boolean> {
  if (!isValidUserPK(userPK)) {
    return false;
  }

  const { upsertedCount } = await userDB.updateOne(
    { userPK },
    {
      $setOnInsert: {
        userPK,
        skapps: [] as string[],

        newContentCurrPage: {},
        newContentCurrNumEntries: {},
      
        contentInteractionsCurrPage: {},
        contentInteractionsNumEntries: {},

        postsCurrPage: {},
        postsCurrNumEntries: {},

        commentsCurrPage: {},
        commentsCurrNumEntries: {},

        cachedDataLinks: {},
      
        createdAt: new Date(),
      }
    },
    { upsert: true }
  )
  return upsertedCount === 1
}

export async function tryLogEvent(eventsDB: Collection, event: Partial<IEvent>): Promise<void> {
  try {
    if (!event.type) {
      console.log(`${new Date().toLocaleString()}: developer error, event type not set`)
      process.exit(1);
    }

    event.createdAt = event.createdAt || new Date()
    await eventsDB.insertOne(event)
  } catch (error) {
    // ignore
  }
}
