import { SkynetClient } from "skynet-js";
import { COLL_ENTRIES, COLL_EVENTS, COLL_USERS } from "../database";
import { MongoDB } from "../database/mongodb";
import { IEvent, IUser, IContent, EventType } from '../types';
import { SKYNET_JWT } from '../consts';
import { fetchEntries as fetchNewContent } from "../crons/fetch_newcontent";
import { fetchEntries as fetchInteractions } from "../crons/fetch_interactions";
import { fetchEntries as fetchPosts } from "../crons/fetch_posts";
import { fetchEntries as fetchComments } from "../crons/fetch_comments";
import { fetchNewSkapps } from "../crons/fetch_skapps";
import { fetchProfiles } from "../crons/fetch_user_profiles";

// watchUsers is a best effort at scraping recently discovered users, we do not
// care about errors thrown here and we wrap everything inside of a try catch
// where we often ignore potential errors.
export async function watchUsers(): Promise<void> {
  // create a client
  const client = new SkynetClient(
    "https://siasky.net",
    { customCookie: SKYNET_JWT }
  );

  // create a mongo connection
  const db = await MongoDB.Connection();
  const usersDB = await db.getCollection<IUser>(COLL_USERS);
  const eventsDB = await db.getCollection<IEvent>(COLL_EVENTS);
  const entriesDB = await db.getCollection<IContent>(COLL_ENTRIES);

  const changeStream = usersDB.watch()
  changeStream.on('change', async doc => {
    // wrap everything in a try catch to ensure we don't break the stream
    try {
      // check if we're dealing with a recently discovered user
      if (
        doc.operationType === 'insert' &&
        doc.fullDocument &&
        doc.fullDocument.discoveredAt
      ) {
        // insert an event
        const userDoc = doc.fullDocument
        await eventsDB.insertOne({
            type: EventType.USER_DISCOVERED,
            context: 'UserWatcher',
            metadata: { user: userDoc },
            createdAt: new Date()
        })
  
        const { userPK } = userDoc
        
        // fetch the user's profiles
        fetchProfiles(client, usersDB, userPK).catch()

        // fetch the user's skapps
        const hasSkaps = await fetchNewSkapps(client, usersDB, userDoc)
        if (!hasSkaps) {
          return
        }
  
        // if he has skapps, fetch the user from the database to get them
        const user = await usersDB.findOne({ userPK })
        if (!user) {
          console.log('recently inserted user not found')
          return; // should not happen
        }

        // now loop all skapps and fire 
        for (const skapp of user.skapps) {
          fetchNewContent(client, usersDB, entriesDB, user, skapp).catch()
          fetchInteractions(client, usersDB, entriesDB, user, skapp).catch()
          fetchPosts(client, usersDB, entriesDB, user, skapp).catch()
          fetchComments(client, usersDB, entriesDB, user, skapp).catch()    
        }
      }
    } catch (error) {
      console.log('UserWatcher error', error)
    }
  })
}
