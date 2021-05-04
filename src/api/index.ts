import express, { Request, Response } from 'express';
import { handler as handleUserDiscovery } from './user_discovery';
import { COLL_ENTRIES, COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { IContent, IEvent, IUser } from '../types';
import { SkynetClient } from 'skynet-js';

export async function init(client: SkynetClient, db: MongoDB, port: number): Promise<void> {
  // fetch db collections
  const entriesDB = await db.getCollection<IContent>(COLL_ENTRIES);
  const eventsDB = await db.getCollection<IEvent>(COLL_EVENTS);
  const usersDB = await db.getCollection<IUser>(COLL_USERS);

  // boot the express app
  const app = express();
  app.listen(port);

  // define routes
  app.get('/userdiscovery', (req: Request, res: Response) => {
    return handleUserDiscovery(req, res, client, usersDB, entriesDB, eventsDB)
  });
}
