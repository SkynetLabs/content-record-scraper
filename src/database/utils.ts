import { Collection, Int32 as NumberInt } from 'mongodb';
import { IEvent, IUser } from '../types';

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
        newContentIndexDataLink: "",
        newContentCurrPageDataLink: "",
      
        contentInteractionsCurrPage: new NumberInt(0),
        contentInteractionsNumEntries: new NumberInt(0),
        contentInteractionsConsecNoneFound: new NumberInt(0),
        contentInteractionsIndexDataLink: "",
        contentInteractionsCurrPageDataLink: "",

        postsCurrPage: new NumberInt(0),
        postsCurrNumEntries: new NumberInt(0),
        postsConsecNoneFound: new NumberInt(0),
        postsIndexDataLink: "",
        postsCurrPageDataLink: "",

        commentsCurrPage: new NumberInt(0),
        commentsCurrNumEntries: new NumberInt(0),
        commentsConsecNoneFound: new NumberInt(0),
        commentsIndexDataLink: "",
        commentsCurrPageDataLink: "",

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
