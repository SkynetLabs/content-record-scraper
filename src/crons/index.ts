import { CronJob } from 'cron';
import { fetchSkapps } from './fetch_skapps';
import { fetchNewContent } from './fetch_newcontent';
import { fetchInteractions } from './fetch_interactions';
import { Mutex } from 'async-mutex';
import { DEBUG_ENABLED } from '../consts';

type CronHandler = () => Promise<void|number>

const CRON_TIME = '0 */15 * * * *' // every 15'
const CRON_TIME_DEV = '0 * * * * *' // every minute".

export async function init(): Promise<void> {
  console.log('Starting cronjobs...');

  const fetchSkappsMutex = new Mutex();
  new CronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME,
    () => {
      tryRun(
        'fetchSkapps',
        fetchSkappsMutex,
        fetchSkapps
      )
    },
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  ).start();

  const fetchNewContentMutex = new Mutex();
  new CronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME,
    () => {
      tryRun(
        'fetchNewContent',
        fetchNewContentMutex,
        fetchNewContent
      )
    },
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  ).start();

  const fetchInteractionsMutex = new Mutex();
  new CronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME,
    () => {
      tryRun(
        'fetchInteractions',
        fetchInteractionsMutex,
        fetchInteractions
      )
    },
    null,
    true,
    'Europe/Brussels',
    undefined,
    true
  ).start();
}

async function tryRun(
  name: string,
  mutex: Mutex,
  handler: CronHandler,
): Promise<void> {
  // skip if mutex is locked
  if (mutex.isLocked()) {
    return;
  }

  // acquire lock
  const release = await mutex.acquire();  
  const start = new Date();

  try {
    // log start
    console.log(`${start.toLocaleString()}: ${name} started`)

    // execute
    const end = new Date()
    const added = await handler()
    if (added) {
      console.log(`${end.toLocaleString()}: ${name} ${added} added`)
    }

    // log end and duration
    const elapsed = end.getTime() - start.getTime();
    console.log(`${end.toLocaleString()}: ${name} ended, took ${elapsed}ms.`)
  } catch (error) {
    console.log(`${start.toLocaleString()}: ${name} failed, error:`, error)
  } finally {
    release(); // important (!)
  }
}
