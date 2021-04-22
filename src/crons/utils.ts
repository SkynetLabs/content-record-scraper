import { Collection, ObjectId } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CR_DATA_DOMAIN, DEBUG_ENABLED } from '../consts';
import { EntryType, EventType, IContent, IEvent } from '../database/types';
import { tryLogEvent } from '../database/utils';
import { IPage, IRawEntry } from './types';

// The following constants define a cooldown mechanism of sorts. Crons will skip
// an iteration if previous runs yielded 0 new entries. Every time we find 0 new
// entries we increment this number, which increases the chance we skip on the
// next iteration. This number is reset to 0 when we find new entries. This
// function is capped at 5%, so for very inactive users we would still run an
// iteration every day (at current crontimes).
const SHOULD_RUN_FACTOR = 1.05;
const SHOULD_RUN_MIN_PCT = 0.05;

export async function downloadNewEntries(
  type: EntryType,
  client: SkynetClient,
  userPK: string,
  skapp: string,
  path: string,
  offset: number = 0
): Promise<IContent[]|null> {
  const page = await downloadFile<IPage<IRawEntry>>(client, userPK, path)
  if (!page) {
    return null;
  }

  return page.entries.slice(offset).map(el => {
    return {
      _id: new ObjectId(),
      dac: CR_DATA_DOMAIN,
      type,
      userPK,
      skapp,
      skylink: el.skylink,
      metadata: el.metadata,
      createdAt: new Date(el.timestamp*1000),
      scrapedAt: new Date(),
    }
  })
}

export async function downloadFile<T>(
  client: SkynetClient,
  userPK: string,
  path: string,
): Promise<T|null> {
  const response = await client.file.getJSON(userPK, path)
  if (!response || !response.data) {
    return null;
  }
  return response.data as unknown as T;
}

export async function settlePromises(
  eventsDB: Collection<IEvent>,
  eventsOnErrorType: EventType,
  promises: Iterable<number>,
  context: string,
): Promise<number> {
  // wait for all promises to be settled
  const results = await Promise.allSettled<number>(promises)

  // process
  let added = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      added += result.value;
    } else if (result.reason) {
      if (typeof result.reason === 'object' && !Object.keys(result.reason).length) {
        continue // TODO: investigate?
      }

      tryLogEvent(eventsDB, {
          context,
          type: eventsOnErrorType,
          error: result.reason,
          createdAt: new Date(),
      })
      if (DEBUG_ENABLED) {
        console.log(`${new Date().toLocaleString()}: ${context} error: '`, result.reason)
      }
    }
  }

  return added
}

export function shouldRun(noResultsCnt: number): boolean {
  let pctChance = 1 / (SHOULD_RUN_FACTOR ** noResultsCnt)
  if (pctChance < SHOULD_RUN_MIN_PCT) {
    pctChance = SHOULD_RUN_MIN_PCT
  }
  return Math.random() <= pctChance
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
