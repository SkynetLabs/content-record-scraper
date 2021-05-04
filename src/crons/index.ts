import { Mutex } from 'async-mutex';
import { CronCommand, CronJob } from 'cron';
import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
// tslint:disable-next-line: max-line-length
import { DEBUG_ENABLED, DISABLE_FETCH_COMMENTS, DISABLE_FETCH_INTERACTIONS, DISABLE_FETCH_NEW_CONTENT, DISABLE_FETCH_POSTS, DISABLE_FETCH_SKAPPS, DISABLE_FETCH_SKYFEED_USERS, DISABLE_FETCH_SOCIAL_GRAPH, DISABLE_FETCH_USER_PROFILES } from '../consts';
import { COLL_EVENTS } from '../database/index';
import { MongoDB } from '../database/mongodb';
import { tryLogEvent } from '../database/utils';
import { CronHandler, EventType, IEvent, Throttle } from '../types';
import { fetchComments } from './fetch_comments';
import { fetchInteractions } from './fetch_interactions';
import { fetchNewContent } from './fetch_newcontent';
import { fetchPosts } from './fetch_posts';
import { fetchSkapps } from './fetch_skapps';
import { fetchSkyFeedUsers } from './fetch_skyfeed_users';
import { fetchSocialGraph } from './fetch_social_graph';
import { fetchUserProfiles } from './fetch_user_profiles';

// tslint:disable-next-line: no-require-imports no-var-requires
const pThrottle = require('p-throttle');

const CRON_TIME_EVERY_5 = '0 */5 * * * *' // every 5'
const CRON_TIME_EVERY_60 = '0 0 * * * *' // every hour
const CRON_TIME_DEV = '0 * * * * *' // every minute.

export async function init(client: SkynetClient): Promise<void> {
  console.log(`${new Date().toLocaleString()}: Starting cronjobs on ${DEBUG_ENABLED? 'debug': 'production'} schedule`);

  // create a connection with the database and fetch the users DB
  const database = await MongoDB.Connection();
  const eventsDB = await database.getCollection<IEvent>(COLL_EVENTS);

  // create a leaky bucket to limit the amount of requests we send the client
  const throttle = pThrottle({
    limit: 300,
    interval: 60_000
  });

  const fetchUserProfilesMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_60,
    () => {
      if (!DISABLE_FETCH_USER_PROFILES) {
        tryRun(
          'fetchUserProfiles',
          fetchUserProfilesMutex,
          fetchUserProfiles,
          database,
          client,
          eventsDB,
          throttle,
        ).catch() // ignore, should have been handled already
      }
    }
  );

  const fetchSkyFeedUsersMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_60,
    () => {
      if (!DISABLE_FETCH_SKYFEED_USERS) {
        tryRun(
          'fetchSkyFeedUsers',
          fetchSkyFeedUsersMutex,
          fetchSkyFeedUsers,
          database,
          client,
          eventsDB,
          throttle,
        ).catch() // ignore, should have been handled already
      }
    }
  );

  const fetchSocialGraphMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_60,
    () => {
      if (!DISABLE_FETCH_SOCIAL_GRAPH) {
        tryRun(
          'fetchSocialGraph',
          fetchSocialGraphMutex,
          fetchSocialGraph,
          database,
          client,
          eventsDB,
          throttle,
        ).catch() // ignore, should have been handled already
      }
    }
  );

  const fetchSkappsMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_60,
    () => {
      if (!DISABLE_FETCH_SKAPPS) {
        tryRun(
          'fetchSkapps',
          fetchSkappsMutex,
          fetchSkapps,
          database,
          client,
          eventsDB,
          throttle,
        ).catch() // ignore, should have been handled already
      } 
    }
  );

  const fetchPostsMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_5,
    () => {
      if (!DISABLE_FETCH_POSTS) {
        tryRun(
          'fetchPosts',
          fetchPostsMutex,
          fetchPosts,
          database,
          client,
          eventsDB,
          throttle,
          ).catch() // ignore, should have been handled already
      }
    }
  );

  const fetchCommentsMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_5,
    () => {
      if (!DISABLE_FETCH_COMMENTS) {
        tryRun(
          'fetchComments',
          fetchCommentsMutex,
          fetchComments,
          database,
          client,
          eventsDB,
          throttle,
          ).catch() // ignore, should have been handled already
      }
    }
  );

  const fetchNewContentMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_5,
    () => {
      if (!DISABLE_FETCH_NEW_CONTENT) {
        tryRun(
          'fetchNewContent',
          fetchNewContentMutex,
          fetchNewContent,
          database,
          client,
          eventsDB,
          throttle,
          ).catch() // ignore, should have been handled already
      }
    }
  );

  const fetchInteractionsMutex = new Mutex();
  startCronJob(
    DEBUG_ENABLED ? CRON_TIME_DEV : CRON_TIME_EVERY_5,
    () => {
      if (!DISABLE_FETCH_INTERACTIONS) {
        tryRun(
          'fetchInteractions',
          fetchInteractionsMutex,
          fetchInteractions,
          database,
          client,
          eventsDB,
          throttle
        ).catch() // ignore, should have been handled already
      }
    }
  );
}

async function tryRun(
  context: string,
  mutex: Mutex,
  handler: CronHandler<number>,
  database: MongoDB,
  client: SkynetClient,
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
    console.log(`${start.toLocaleString()}: ${context} started`)

    // execute
    const added = await handler(database, client, throttle)
    const end = new Date()
    if (added) {
      console.log(`${end.toLocaleString()}: ${context} ${added} added`)
    }
    
    // log end and duration
    const elapsed = end.getTime() - start.getTime();
    console.log(`${end.toLocaleString()}: ${context} ended, took ${elapsed}ms.`)

    // insert event
    await tryLogEvent(eventsDB, {
      context,
      type: EventType.ITERATION_SUCCESS,
      metadata: { duration: elapsed, added } ,
      createdAt: new Date(),
    })
  } catch (error) {
    console.log(`${start.toLocaleString()}: ${context} failed, error:`, error)

    // insert event
    await tryLogEvent(eventsDB, {
      context,
      type: EventType.ITERATION_FAILURE,
      error: error.message,
      metadata: { error } ,
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
