import { ObjectId } from "mongodb";
import { Int32 as NumberInt } from 'mongodb'

export interface IContent {
  _id: ObjectId;

  user: string;
  skapp: string;
  skylink: string;
  metadata: object;
  created: Date;
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
