import { Collection, Int32 as NumberInt } from 'mongodb';
import { IEvent } from './types';

export async function upsertUser(userDB: Collection, userPK: string): Promise<boolean> {
  const { upsertedCount } = await userDB.updateOne(
    { userPK },
    {
      $setOnInsert: {
        userPK,
        skapps: [] as string[],
        newContentCurrPage : new NumberInt(0),
        newContentCurrNumEntries : new NumberInt(0),
        contentInteractionsCurrPage : new NumberInt(0),
        contentInteractionsNumEntries: new NumberInt(0),
        createdAt: new Date(),
      }
    },
    { upsert: true }
  )
  return upsertedCount === 1
}

export async function tryLogEvent(eventsDB: Collection, event: IEvent): Promise<void> {
  try {
    await eventsDB.insertOne(event)
  } catch (error) {
    // ignore
  }
}
