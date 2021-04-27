import { Collection, Int32 as NumberInt } from 'mongodb';
import { IEvent, IUser } from './types';

export async function upsertUser(userDB: Collection<IUser>, userPK: string): Promise<boolean> {
  const { upsertedCount } = await userDB.updateOne(
    { userPK },
    {
      $setOnInsert: {
        userPK,
        skapps: [] as string[],
        newContentCurrPage : new NumberInt(0),
        newContentCurrNumEntries: new NumberInt(0),
        newContentConsecNoneFound: new NumberInt(0),

        contentInteractionsCurrPage : new NumberInt(0),
        contentInteractionsNumEntries: new NumberInt(0),
        contentInteractionsNoneFound: new NumberInt(0),

        postsCurrPage: new NumberInt(0),
        postsCurrNumEntries: new NumberInt(0),
        postsConsecNoneFound: new NumberInt(0),

        commentsCurrPage: new NumberInt(0),
        commentsCurrNumEntries: new NumberInt(0),
        commentsConsecNoneFound: new NumberInt(0),
        
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
