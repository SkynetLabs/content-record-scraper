import { CronJob } from 'cron';
import { fetchEntries } from './fetch_entries';
import { fetchSkapps } from './fetch_skapps';

export async function init() {
  new CronJob(
    '0 0 * * * *', // hourly
    fetchSkapps,
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  );

  new CronJob(
    '0 0 * * * *', // hourly
    fetchEntries,
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  );
}
