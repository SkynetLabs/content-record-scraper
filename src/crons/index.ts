import { CronJob } from 'cron';
import { fetchSkapps } from './fetch_skapps';
import { fetchNewContent } from './fetch_newcontent';
import { fetchInteractions } from './fetch_interactions';

type CronHandler = () => Promise<void>

const DEV_ENABLED = true;

const CRON_TIME = '0 */15 * * * *' // every 15'
const CRON_TIME_DEV = '*/15 * * * * *' // every 15".

export async function init(): Promise<void> {
  console.log('Starting cronjobs...');

  new CronJob(
    DEV_ENABLED ? CRON_TIME_DEV : CRON_TIME,
    () => { logIterationTime('fetchSkapps', fetchSkapps) },
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  ).start();

  new CronJob(
    DEV_ENABLED ? CRON_TIME_DEV : CRON_TIME,
    () => { logIterationTime('fetchNewContent', fetchNewContent) },
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  ).start();

  new CronJob(
    DEV_ENABLED ? CRON_TIME_DEV : CRON_TIME,
    () => { logIterationTime('fetchInteractions', fetchInteractions) },
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  ).start();
}

async function logIterationTime(name: string, handler: CronHandler): Promise<void> {
  const start = new Date();
  console.log(`${start.toLocaleString()}: ${name} started`)

  try {
    await handler()
  } catch (error) {
    console.log(`${start.toLocaleString()}: ${name} failed, error:`, error)
  } finally {
    const end = new Date()
    const elapsed = end.getTime() - start.getTime();
    console.log(`${end.toLocaleString()}: ${name} ended, took ${elapsed}ms.`)
  }
}
