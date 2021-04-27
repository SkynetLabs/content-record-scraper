import { ObjectId } from "mongodb";
import { Int32 as NumberInt } from 'mongodb'

export enum EventType {
  ITERATION_SUCCESS = 'ITERATION_SUCCESS',
  ITERATION_FAILURE = 'ITERATION_FAILURE',

  FETCHNEWCONTENT_ERROR = 'FETCHNEWCONTENT_ERROR',
  FETCHINTERACTIONS_ERROR = 'FETCHINTERACTIONS_ERROR',
  FETCHPOSTS_ERROR = 'FETCHPOSTS_ERROR',
  FETCHCOMMENTS_ERROR = 'FETCHCOMMENTS_ERROR',
  FETCHSKYFEEDUSERS_ERROR = 'FETCHSKYFEEDUSERS_ERROR',
  FETCHSKAPPS_ERROR = 'FETCHSKAPPS_ERROR'
}

export enum EntryType {
  NEWCONTENT = 'NEWCONTENT',
  INTERACTION = 'INTERACTION',
  COMMENT = 'COMMENT',
  REPOST = 'REPOST',
  POST = 'POST'
}

export function entryTypeToType(entryType: EntryType): string {
  switch (entryType) {
    case EntryType.NEWCONTENT:
    case EntryType.POST:
      return 'newcontent';
    case EntryType.INTERACTION:
    case EntryType.REPOST:
    case EntryType.COMMENT:
      return 'interaction';
    default:
      throw new Error(`Unknown entry type ${entryType}`)
  }
}

export interface IContent {
  _id: ObjectId;

  // root identifies to what entry this entry refers to, this way we can
  // aggregate interactions with parent entries. We call this root and not
  // parent because an entry without parent refers to itself and not null.
  root: string;

  // identifier will uniquely identify this entry, Feed DAC does not use
  // skylinks, therefor we need a new identifier property, for the Content
  // Record DAC the identifier will be equal to the skyink, for the Feed DAC
  // this will be different
  identifier: string;

  // type will squash all entry types on `newcontent` or `interactions`, this
  // way the leaderboard can render its UI and new entry types can be introduced
  type: string;

  dacDataDomain: string;
  entryType: EntryType;
  
  userPK: string;
  skapp: string;
  skylink: string;
  skylinkUnsanitized: string;
  metadata: object;
  createdAt: Date;
  scrapedAt: Date;
}

export interface IInteraction extends IContent { }

export interface IUser {
  _id?: ObjectId;
  
  userPK: string;
  skapps: string[];

  newContentCurrPage: NumberInt;
  newContentCurrNumEntries: NumberInt;
  newContentConsecNoneFound: NumberInt;

  contentInteractionsCurrPage: NumberInt;
  contentInteractionsNumEntries: NumberInt;
  contentInteractionsConsecNoneFound: NumberInt;

  postsCurrPage: NumberInt;
  postsCurrNumEntries: NumberInt;
  postsConsecNoneFound: NumberInt;

  commentsCurrPage: NumberInt;
  commentsCurrNumEntries: NumberInt;
  commentsConsecNoneFound: NumberInt;

  createdAt: Date;
}

export interface IEvent {
  _id?: ObjectId;
  type: EventType;
  context?: string;
  description?: string;
  metadata?: object;
  error?: string;
  createdAt: Date;
}
