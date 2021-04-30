import { Collection, ObjectId } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { DEBUG_ENABLED } from '../consts';
import { DataLink, EntryType, entryTypeToType, EventType, IContent, IEvent, JSONDownloadResponse } from '../types';
import { tryLogEvent } from '../database/utils';
import { IPage, isFeedDACPage, IRawEntry, Post } from '../types';

// The following constants define a cooldown mechanism of sorts. Crons will skip
// an iteration if previous runs yielded 0 new entries. Every time we find 0 new
// entries we increment this number, which increases the chance we skip on the
// next iteration. This number is reset to 0 when we find new entries. This
// function is capped at 5%, so for very inactive users we would still run an
// iteration every day (at current crontimes).
const SHOULD_RUN_FACTOR = 1.05;
const SHOULD_RUN_MIN_PCT = 0.05;

export async function downloadNewEntries(
  dacDataDomain: string,
  entryType: EntryType,
  client: SkynetClient,
  userPK: string,
  skapp: string,
  path: string,
  cachedDataLink: string = "",
  offset: number = 0
): Promise<[IContent[], DataLink]> {
  const {cached, data: page, dataLink } = await downloadFile<IPage>(client, userPK, path, cachedDataLink)
  if (cached || !page) {
    return [[], ""];
  }

  const pageItems = isFeedDACPage(page)
    ? page.items.slice(offset)
    : page.entries.slice(offset);

  const entries = [];
  for (const item of pageItems) {
    entries.push(pageItemToEntry(
      dacDataDomain,
      entryType,
      userPK,
      skapp,
      item,
      page._self
    ))
  }

  return [
    entries.filter(Boolean), // filters out null entries
    dataLink
  ]
}

export async function downloadFile<T>(
  client: SkynetClient,
  userPK: string,
  path: string,
  cachedDataLink: string = "",
): Promise<JSONDownloadResponse<T>> {
  const response = await client.file.getJSON(userPK, path, { cachedDataLink })
  if (response && response.dataLink === cachedDataLink) {
    return { data: null, dataLink: cachedDataLink, cached: true}
  }

  if (response && response.data) {
    return {
      data: response.data as unknown as T,
      dataLink: response.dataLink,
      cached: false
    }
  }

  return { data: null, dataLink: null, cached: false}
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

      await tryLogEvent(eventsDB, {
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

export function pageItemToEntry(
  dacDataDomain: string,
  entryType: EntryType,
  userPK: string,
  skapp: string,
  item: IRawEntry | Post,
  pageRef?: string // this is _self to be able construct the id in case of Post
): IContent | null {
  // invalid page item
  const isValidPageItem =
    item.hasOwnProperty('id') && (item as Post).id ||
    item.hasOwnProperty('skylink') && sanitizeSkylink((item as IRawEntry).skylink)

  if (!isValidPageItem) {
    return null
  }

  const entry: Partial<IContent> = {
    _id: new ObjectId(),
    dacDataDomain,
    entryType,
    userPK,
    skapp,
    scrapedAt: new Date(),
  };

  if (item.hasOwnProperty('skylink')) {
    item = item as IRawEntry
    entry.type = entryTypeToType(entryType),
    entry.skylinkUnsanitized = item.skylink;
    entry.skylink = sanitizeSkylink(item.skylink);
    entry.identifier = entry.skylink;
    entry.root = entry.identifier; // no parent
    entry.metadata = item.metadata;
    entry.createdAt = new Date(item.timestamp * 1000);
  }

  if (item.hasOwnProperty('id')) {
    item = item as Post

    const isPost =
      entryType === EntryType.POST ||
      entryType === EntryType.REPOST

    const isRepost =
      isPost &&
      item.repostOf !== null &&
      item.repostOf !== undefined;

    const isComment =
      entryType === EntryType.COMMENT &&
      item.commentTo !== null &&
      item.commentTo !== undefined

    entry.type = entryTypeToType(isRepost ? EntryType.REPOST : entryType),
    entry.identifier = `${pageRef}#${item.id}`;
    entry.metadata = item;
    entry.createdAt = new Date(item.ts);

    // root refers to the entry this entry refers to, if it doesn't refer to
    // anything it'll refer to itself which is its identifier
    entry.root =
      isComment
      ? item.commentTo
      : isRepost
        ? item.repostOf
        : entry.identifier
  }

  return entry as IContent;
}

export function sanitizeSkylink(skylinkRaw: string): string {
  const indexRegexp = /^(.*[\/:])?(?<skylink>[a-zA-Z0-9-_]{46})\/?$/;
  const matchResult = skylinkRaw.match(indexRegexp)
  if (!matchResult || !matchResult.groups) {
    return ""
  }
  return matchResult.groups.skylink
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
