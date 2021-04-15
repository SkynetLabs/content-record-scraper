export interface IDictionary {
  [key: string]: boolean
}

export interface IIndex {
  version: number;

  currPageNumber: number;
  currPageNumEntries: number;

  pagePaths: string[];
  pageSize: number;
}

export interface IPage<IEntry> {
  version: number;

  indexPath: string; // back reference to the index
  pagePath: string; // back reference to the path

  entries: IEntry[];
}

export interface IRawEntry {
  skylink: string;    // skylink
  metadata: object;   // should be valid JSON
  timestamp: number;  // unix timestamp of recording
}
