import { ObjectId } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { IContent } from '../database/types';
import { IPage, IRawEntry } from './types';

export async function downloadNewEntries(
  client: SkynetClient,
  user: string,
  skapp: string,
  path: string,
  offset: number = 0
): Promise<IContent[]> {
  const page = await downloadFile<IPage<IRawEntry>>(client, user, path)
  return page.entries.slice(offset).map(el => {
    return {
      _id: new ObjectId(),
      user,
      skapp,
      skylink: el.content,
      metadata: el.metadata,
      created: new Date(el.timestamp),
    }
  })
}

export async function downloadFile<T>(
  client: SkynetClient,
  user: string,
  path: string,
): Promise<T> {
  const response = await client.file.getJSON(user, path)
  if (!response || !response.data) {
    throw new Error(`Could not find file for user '${user}' at path '${path}'`)
  }
  return response.data as unknown as T;
}
