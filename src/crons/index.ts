import { CronJob } from 'cron';
import { fetchEntries } from './fetch_entries';
import { fetchSkapps } from './fetch_skapps';

export async function init(): Promise<void> {
  new CronJob(
    '0 0 * * * *', // hourly
    fetchSkapps,
    null,
    true,
    'Europe/Brussels',
  ).start();

  new CronJob(
    '0 0 * * * *', // hourly
    fetchEntries,
    null,
    true,
    'Europe/Brussels',
  ).start();
  
  console.log('Crons started.')
}
