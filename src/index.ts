import { SkynetClient } from 'skynet-js';
import { init as initAPI } from './api';
import { SCRAPERAPI_PORT, SKYNET_JWT, SKYNET_PORTAL_URL } from './consts';
import { init as initCrons } from './crons';
import { init as initDB } from './database';
import { MongoDB } from './database/mongodb';

// tslint:disable-next-line: no-require-imports no-var-requires
const pThrottle = require('p-throttle');

// tslint:disable-next-line: no-floating-promises
(async () => {
  // create a leaky bucket to limit the amount of requests we send the client
  const throttle = pThrottle({
    limit: 100,
    interval: 60_000
  });

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
    await initCrons(client, throttle);
  } catch (error) {
    console.log(`${new Date().toLocaleString()}: Failed to initialize cronjobs, error: \n\n`, error);
    process.exit(1);
  }

  // init API
  try {
    await initAPI(client, throttle, mongoDB, SCRAPERAPI_PORT);
    console.log(`${new Date().toLocaleString()}: Initialized API at port ${SCRAPERAPI_PORT}`);
  } catch (error) {
    console.log(`${new Date().toLocaleString()}: Failed to initialize the API, error: \n\n`, error);
    process.exit(1);
  }

  console.log(`${new Date().toLocaleString()}: Scraper started.`);
})();
