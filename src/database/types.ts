import { ObjectId } from "mongodb";
import { Int32 as NumberInt } from 'mongodb'

export enum EntryType {
  NEWCONTENT = 'newcontent',
  INTERACTION = 'interaction',
}
export interface IContent {
  _id: ObjectId;

  dac: string; // data domain
  type: EntryType;
  
  userPK: string;
  skapp: string;
  skylink: string;
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

  contentInteractionsCurrPage: NumberInt;
  contentInteractionsNumEntries: NumberInt;
}
