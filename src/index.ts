import { init as initCrons } from './crons';
import { init as initDB } from './database';

// tslint:disable-next-line: no-floating-promises
(async () => {
  try {
    await initDB();
  } catch (error) {
    console.log(`${new Date().toLocaleString()}: Failed to initialize the database, error: \n\n`, error);
    process.exit(1);
  }

  try {
    await initCrons();
  } catch (error) {
    console.log(`${new Date().toLocaleString()}: Failed to initialize cronjobs, error: \n\n`, error);
    process.exit(1);
  }

  console.log(`${new Date().toLocaleString()}: Scraper started.`);
})();
