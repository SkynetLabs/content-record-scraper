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

  console.log(`${new Date().toLocaleString()}: user discovery request received for user ${userPK}, scrape ${scrape}\n\n`);

  // upsert the user and log a discovery event in case it was an unknown user
  const discovered = await upsertUser(usersDB, userPK)
  if (discovered) {
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

  try {
    // fetch the user's profiles
    await fetchProfiles(client, usersDB, user)

    // fetch the user's skapps
    await fetchNewSkapps(client, usersDB, user)

    // refetch the user to get skapp list
    user = await usersDB.findOne({ userPK })
    if (!user) {
      res.status(404).json({ error: `user not found` });
      return
    }

    // now loop all skapps and fire a scrape event
    for (const skapp of user.skapps) {
      fetchNewContent(client, usersDB, entriesDB, user, skapp).catch()
      fetchInteractions(client, usersDB, entriesDB, user, skapp).catch()
      fetchPosts(client, usersDB, entriesDB, user, skapp).catch()
      fetchComments(client, usersDB, entriesDB, user, skapp).catch()    
    }

  } catch (error) {
    res.status(500).json({ error: `error occurred while discovering user, err: ${error.message}` });
    return
  }

  res.status(200).json({ user })
}
