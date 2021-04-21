import { Collection, ObjectId } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CR_DATA_DOMAIN, DEBUG_ENABLED } from '../consts';
import { EntryType, EventType, IContent, IEvent } from '../database/types';
import { tryLogEvent } from '../database/utils';
import { IPage, IRawEntry } from './types';

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
// sleep is a small helper function that sleeps for the given amount of time in
// milliseconds.
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
