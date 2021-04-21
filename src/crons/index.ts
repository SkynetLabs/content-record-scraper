import { Mutex } from 'async-mutex';
import { CronCommand, CronJob } from 'cron';
import { Collection } from 'mongodb';
import { DEBUG_ENABLED } from '../consts';
import { COLL_EVENTS } from '../database/index';
import { MongoDB } from '../database/mongodb';
import { EventType, IEvent } from '../database/types';
import { tryLogEvent } from '../database/utils';
import { fetchInteractions } from './fetch_interactions';
import { fetchNewContent } from './fetch_newcontent';
import { fetchSkapps } from './fetch_skapps';
import { fetchSkyFeedUsers } from './fetch_skyfeed_users';
import { CronHandler, Throttle } from './types';

// tslint:disable-next-line: no-require-imports no-var-requires
const pThrottle = require('p-throttle');

const CRON_TIME_EVERY_15 = '0 */15 * * * *' // every 15'
const CRON_TIME_EVERY_60 = '0 * * * * *' // every hour
const CRON_TIME_DEV = '0 * * * * *' // every minute.

export async function init(): Promise<void> {
  console.log(`${new Date().toLocaleString()}: Starting cronjobs on ${DEBUG_ENABLED? 'debug': 'production'} schedule`);

  // create a connection with the database and fetch the users DB
  const db = await MongoDB.Connection();
  const eventsDB = await db.getCollection<IEvent>(COLL_EVENTS);
  
  // create a leaky bucket to limit the amount of requests we send the client
  const throttle = pThrottle({
    limit: 1,
    interval: 1_000
  }); // limit to 1r/s to be on the safe side

  const fetchSkyFeedUsersMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_60,
    () => {
      tryRun(
        'fetchSkyFeedUsers',
        fetchSkyFeedUsersMutex,
        fetchSkyFeedUsers,
        eventsDB,
        throttle,
      )
    }
  );

  const fetchSkappsMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_60,
    () => {
      tryRun(
        'fetchSkapps',
        fetchSkappsMutex,
        fetchSkapps,
        eventsDB,
        throttle,
      )
    }
  );

  const fetchNewContentMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_15,
    () => {
      tryRun(
        'fetchNewContent',
        fetchNewContentMutex,
        fetchNewContent,
        eventsDB,
        throttle,
      )
    }
  );

  const fetchInteractionsMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_15,
    () => {
      tryRun(
        'fetchInteractions',
        fetchInteractionsMutex,
        fetchInteractions,
        eventsDB,
        throttle
      )
    }
  );
}

async function tryRun(
  name: string,
  mutex: Mutex,
  handler: CronHandler<number>,
  eventsDB: Collection<IEvent>,
  throttle: Throttle<number>,
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
    const added = await handler(throttle)
    const end = new Date()
    if (added) {
      console.log(`${end.toLocaleString()}: ${name} ${added} added`)
    }
    
    // log end and duration
    const elapsed = end.getTime() - start.getTime();
    console.log(`${end.toLocaleString()}: ${name} ended, took ${elapsed}ms.`)

    // insert event
    tryLogEvent(eventsDB, {
      type: EventType.ITERATION_SUCCESS,
      metadata: { cron: name, duration: elapsed, success: true, added } ,
      createdAt: new Date(),
    })
  } catch (error) {
    console.log(`${start.toLocaleString()}: ${name} failed, error:`, error)

    // insert event
    tryLogEvent(eventsDB, {
      type: EventType.ITERATION_FAILURE,
      error: error.message,
      metadata: { cron: name, error } ,
      createdAt: new Date(),
    })
  } finally {
    release(); // important (!)
  }
}

function startCronJob(cronTime: string, cronCommand: CronCommand): void {
  new CronJob(
    cronTime,
    cronCommand,
    null,
    false, // start
    'Europe/Brussels',
    undefined,
    true // run on init
  ).start();
}
