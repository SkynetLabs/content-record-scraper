import { ObjectId } from "mongodb";
import { Int32 as NumberInt } from 'mongodb'

export enum EntryType {
  NEWCONTENT = 'newcontent',
  INTERACTION = 'interaction',
}
export interface IContent {
  _id: ObjectId;

  type: EntryType;
  user: string;
  skapp: string;
  skylink: string;
  metadata: object;
  createdAt: Date;
  scrapedAt: Date;
}

export interface IInteraction extends IContent { }

export interface IUser {
  _id?: ObjectId;
  
  pubkey: string;
  skapps: string[];

  newContentCurrPage: NumberInt;
  newContentCurrNumEntries: NumberInt;

  contentInteractionsCurrPage: NumberInt;
  contentInteractionsNumEntries: NumberInt;
}
