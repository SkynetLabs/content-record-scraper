import { init as initAPI } from './api';
import { init as initCrons } from './crons';
import { init as initDB } from './database';
import { SkynetClient } from 'skynet-js';
import { SKYNET_JWT, SKYNET_PORTAL_URL, SCRAPERAPI_PORT } from './consts';
import { MongoDB } from './database/mongodb';

// tslint:disable-next-line: no-floating-promises
(async () => {
  // init client
  let client: SkynetClient
  try {
    client = new SkynetClient(
      SKYNET_PORTAL_URL,
      { customCookie: SKYNET_JWT }
    );
    if (SKYNET_JWT) {
      console.log(`${new Date().toLocaleString()}: Initialized client using custom JWT: ${SKYNET_JWT ? 'yes': 'no'}`);
    }
  } catch (error) {
    console.log(`${new Date().toLocaleString()}: Failed to initialize the client, error: \n\n`, error);
    process.exit(1);
  }

  // init database
  let mongoDB: MongoDB;
  try {
    mongoDB = await initDB();
  } catch (error) {
    console.log(`${new Date().toLocaleString()}: Failed to initialize the database, error: \n\n`, error);
    process.exit(1);
  }

  // init crons
  try {
    await initCrons(client);
  } catch (error) {
    console.log(`${new Date().toLocaleString()}: Failed to initialize cronjobs, error: \n\n`, error);
    process.exit(1);
  }

  // init API
  try {
    await initAPI(client, mongoDB, SCRAPERAPI_PORT);
    console.log(`${new Date().toLocaleString()}: Initialized API at port ${SCRAPERAPI_PORT}`);
  } catch (error) {
    console.log(`${new Date().toLocaleString()}: Failed to initialize the API, error: \n\n`, error);
    process.exit(1);
  }

  console.log(`${new Date().toLocaleString()}: Scraper started.`);
})();
