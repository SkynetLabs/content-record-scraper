import { init as initDB } from './database'
import { init as initCrons } from './crons'

(async () => {
  await initDB();
  await initCrons();
})();
