
// tslint:disable: no-var-requires
// tslint:disable: no-require-imports
require('dotenv').config()

export const MONGO_CONNECTION_STRING =
  process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost:27017'

export const MONGO_DB_NAME =
  process.env.MONGO_DB_NAME || 'content-record'

export const TEST_USER_PUBKEY =
  process.env.TEST_USER_PUBKEY || 'f301891b7e41b107beefe91a133d6efa8c7b0dfe0f5e39650c34b8311c365d39'

export const CR_DATA_DOMAIN =
  process.env.CR_DATA_DOMAIN || 'crqa.hns'

export const SKYNET_PORTAL_URL = 'https://siasky.net'