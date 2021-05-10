import express, { Request, Response } from 'express';
import { SkynetClient } from 'skynet-js';
import { MongoDB } from '../database/mongodb';
import { Throttle } from '../types';
import { handler as handleUserDiscovery } from './user_discovery';

export async function init(client: SkynetClient, throttle: Throttle<number>, db: MongoDB, port: number): Promise<void> {
  // boot the express app
  const app = express();
  app.listen(port);

  // define routes
  app.get('/userdiscovery', (req: Request, res: Response) => {
    return handleUserDiscovery(req, res, client, throttle, db)
  });
}
