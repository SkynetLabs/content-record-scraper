
// tslint:disable: no-var-requires
// tslint:disable: no-require-imports
require('dotenv').config()

export const MONGO_CONNECTION_STRING =
  process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost:27017'

export const MONGO_DB_NAME =
  process.env.MONGO_DB_NAME || 'content-record'

export const TEST_USER_PUBKEY =
  process.env.TEST_USER_PUBKEY ||
  'f301891b7e41b107beefe91a133d6efa8c7b0dfe0f5e39650c34b8311c365d39'

export const SKYFEED_SEED_USER_PUBKEY =
  process.env.SKYFEED_SEED_USER_PUBKEY ||
  'd448f1562c20dbafa42badd9f88560cd1adb2f177b30f0aa048cb243e55d37bd'

export const CR_DATA_DOMAIN =
  process.env.CR_DATA_DOMAIN || 'crqa.hns'

export const SKYNET_PORTAL_URL = 'https://siasky.net'

export const DEBUG_ENABLED = process.env.DEBUG_ENABLED === 'true';

export const EVENT_EXPIRY_IN_S = 60 * 60 * 24 * 7; // last 7 days