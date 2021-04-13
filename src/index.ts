import { init as initDB } from './database'
import { init as initCrons } from './crons'

(async () => {
  try {
    await initDB();
  } catch (error) {
    console.log('Failed to initialize the database, error: \n\n', error);
    process.exit(1);
  }

  try {
    await initCrons();
  } catch (error) {
    console.log('Failed to initialize cronjobs, error: \n\n', error);
    process.exit(1);
  }

  console.log('Scraper started.');
})();
