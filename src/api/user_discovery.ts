import { Request, Response } from 'express';
import { Collection } from 'mongodb';
import { fetchEntries as fetchComments } from "../crons/fetch_comments";
import { fetchEntries as fetchInteractions } from "../crons/fetch_interactions";
import { fetchEntries as fetchNewContent } from "../crons/fetch_newcontent";
import { fetchEntries as fetchPosts } from "../crons/fetch_posts";
import { fetchNewSkapps } from "../crons/fetch_skapps";
import { fetchProfiles } from "../crons/fetch_user_profiles";
import { SkynetClient } from 'skynet-js';
import { EventType, IContent, IEvent, IUser } from '../types';
import { upsertUser } from '../database/utils';
import NodeCache from 'node-cache'
import { USER_SCRAPE_RATE_LIMIT_IN_S } from '../consts';

const cache = new NodeCache()

export async function handler(
  req: Request,
  res: Response,
  client: SkynetClient,
  usersDB: Collection<IUser>,
  entriesDB: Collection<IContent>,
  eventsDB: Collection<IEvent>,
): Promise<void> {
  // fetch 'userPK' param from request
  const userPK = req.query.userPK || ""
  if (!userPK) {
    res.status(400).json({ error: "parameter 'userPK' not found" });
    return
  }
  if (typeof userPK !== "string") {
    res.status(400).json({ error: "parameter 'userPK' should be a string" });
    return
  }
  
  // fetch 'scrape' param from request
  const scrape = Boolean(req.query.scrape) || false

  // check whether we're not getting spammed
  if (scrape) {
    if (cache.has(userPK)) {
      res.status(429).json({ error: "given 'userPK' was scraped recently" });
      return
    }
    cache.set(userPK, true, USER_SCRAPE_RATE_LIMIT_IN_S)
    console.log(`${new Date().toLocaleString()}: scraping user ${userPK}`);
  }

  // upsert the user and log a discovery event in case it was an unknown user
  const discovered = await upsertUser(usersDB, userPK)
  if (discovered) {
    console.log(`${new Date().toLocaleString()}: discovered user ${userPK}`);
    try {
      await eventsDB.insertOne({
        context: 'userdiscovery',
        type: EventType.USER_DISCOVERED,
        metadata: { userPK } ,
        createdAt: new Date(),
      })
    } catch (error) {
      console.log(`${new Date().toLocaleString()}: Failed to add event to the database, error: \n\n`, error);
    }
  }

  // if the user was not discovered, and the caller did not explicitly ask to
  // scrape the given user, we return early
  if (!discovered && !scrape) {
    res.status(202).json({ scraped: false, discovered: false });
    return
  }

  // fetch the user
  let user: IUser;
  try {
    user = await usersDB.findOne({ userPK })
  } catch (error) {
    res.status(404).json({ error: `user not found, err: ${error.message}` });
    return
  }

  let found: number;
  try {
    // fetch the user's profiles
    found = await fetchProfiles(client, usersDB, eventsDB, user)
    if (found) {
      console.log(`${new Date().toLocaleString()}: ${userPK}, found ${found} profile updates`);
    }

    // fetch the user's skapps
    found = await fetchNewSkapps(client, usersDB, user)
    if (found) {
      console.log(`${new Date().toLocaleString()}: ${userPK}, found ${found} new skapps`);
    }

    // refetch the user to get skapp list
    user = await usersDB.findOne({ userPK })
    if (!user) {
      res.status(404).json({ error: `user not found` });
      return
    }

    // now loop all skapps and fire a scrape event
    for (const skapp of user.skapps) {
      try {
        found = await fetchNewContent(
          client,
          usersDB,
          entriesDB,
          user,
          skapp
        )
        if (found) {
          console.log(`${new Date().toLocaleString()}: ${userPK}, found ${found} new content entries`);
        }
        found = await fetchInteractions(
          client,
          usersDB,
          entriesDB,
          user,
          skapp
        )
        if (found) {
          console.log(`${new Date().toLocaleString()}: ${userPK}, found ${found} new interaction entries`);
        }
        found = await fetchPosts(
          client,
          usersDB,
          entriesDB,
          user,
          skapp
        );
        if (found) {
          console.log(`${new Date().toLocaleString()}: ${userPK}, found ${found} new post entries`);
        }
        found = await fetchComments(
          client,
          usersDB,
          entriesDB,
          user,
          skapp
        )
        if (found) {
          console.log(`${new Date().toLocaleString()}: ${userPK}, found ${found} new comment entries`);
        }
      } catch (error) {
        console.log(`${new Date().toLocaleString()}: error scraping ${skapp} for user '${user.userPK}'`, error)
      }
    }

  } catch (error) {
    console.log(`${new Date().toLocaleString()}: user ${userPK} scrape error, ${error.message}`);
    res.status(500).json({ error: `error occurred while discovering user, err: ${error.message}` });
    return
  }

  res.status(200).json({ user })
}
