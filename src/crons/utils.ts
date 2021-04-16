import { ObjectId } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CR_DATA_DOMAIN } from '../consts';
import { EntryType, IContent } from '../database/types';
import { IPage, IRawEntry } from './types';

export async function downloadNewEntries(
  type: EntryType,
  client: SkynetClient,
  userPK: string,
  skapp: string,
  path: string,
  offset: number = 0
): Promise<IContent[]> {
  const page = await downloadFile<IPage<IRawEntry>>(client, userPK, path)
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
): Promise<T> {
  const response = await client.file.getJSON(userPK, path)
  if (!response || !response.data) {
    throw new Error(`Couldn't find file for user '${userPK}' at path '${path}'`)
  }
  return response.data as unknown as T;
}
