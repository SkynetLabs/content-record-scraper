import { ObjectId } from "mongodb";

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
  _id: ObjectId;
  
  pubkey: string;
  skapps: string[];

  newContentCurrPage: number;
  newContentCurrNumEntries: number;

  contentInteractionsCurrPage: number;
  contentInteractionsNumEntries: number;
}
