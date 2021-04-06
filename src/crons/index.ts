import { CronJob } from 'cron';
import { fetchEntries } from './fetch_entries';
import { fetchSkapps } from './fetch_skapps';

export async function init(): Promise<void> {
  const cronFetchSkapps = new CronJob(
    '0 0 * * * *', // hourly
    fetchSkapps,
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  );

  const cronFetchEntries = new CronJob(
    '0 0 * * * *', // hourly
    fetchEntries,
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  );
  
  console.log('Crons started.')
  cronFetchSkapps.start();
  cronFetchEntries.start();
}
