export * from './skystandards';
import { Post } from './skystandards';

export interface IDictionary<T> {
  [key: string]: T
}

export interface IUserProfile {
  username: string;
  aboutMe: string;
  location: string;
  avatar: string;
  dapps: IDictionary<IDapp>;
}

export interface IDapp {
  url: string;
  publicKey: string;
  img: string;
}

export interface IIndex {
  version: number;

  currPageNumber: number;
  currPageNumEntries: number;

  pagePaths: string[];
  pageSize: number;
}

export interface IPage {
  version: number;

  indexPath: string; // back reference to the index
  pagePath: string; // back reference to the path
  entries: IRawEntry[];

  // added by redsolver for feed DAC
  $schema: string;
  _self: string; // back reference to the path
  items: Post[];
}

export function isFeedDACPage(page: IPage): boolean {
  return Object.keys(page).includes('$schema');
}

export interface IRawEntry {
  skylink: string;    // skylink
  metadata: object;   // should be valid JSON
  timestamp: number;  // unix timestamp of recording
}

export type Throttle<T> = (fn: Function) => () => Promise<T>

export type CronHandler<T> = (throttle: Throttle<T>) => Promise<T>
