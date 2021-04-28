
// tslint:disable: no-var-requires
// tslint:disable: no-require-imports
require('dotenv').config()

export const MONGO_CONNECTION_STRING =
  process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost:27017'

export const MONGO_DB_NAME =
  process.env.MONGO_DB_NAME || 'content-record'

export const CONTENTRECORD_DAC_DATA_DOMAIN =
  process.env.CONTENTRECORD_DAC_DATA_DOMAIN || 'crqa.hns'

export const FEED_DAC_DATA_DOMAIN =
  process.env.FEED_DAC_DATA_DOMAIN || 'skyfeed-dev.hns'

export const MYSKY_PROFILE_DAC_DATA_DOMAIN = 
  process.env.MYSKY_PROFILE_DAC_DATA_DOMAIN || 'skyuser.hns'

export const SKYNET_PORTAL_URL = 'https://siasky.net'

export const DEBUG_ENABLED = process.env.DEBUG_ENABLED === 'true';

export const EVENT_EXPIRY_IN_S = 60 * 60 * 24 * 7; // last 7 days

// allow disabling crons from env
export const DISABLE_FETCH_USER_PROFILES =
  process.env.DISABLE_FETCH_USER_PROFILES || false;

export const DISABLE_FETCH_SKYFEED_USERS =
  process.env.DISABLE_FETCH_SKYFEED_USERS || true;

export const DISABLE_FETCH_SKAPPS =
  process.env.DISABLE_FETCH_SKAPPS || false;

export const DISABLE_FETCH_NEW_CONTENT =
  process.env.DISABLE_FETCH_NEW_CONTENT || false;

export const DISABLE_FETCH_INTERACTIONS =
  process.env.DISABLE_FETCH_INTERACTIONS || false;

export const DISABLE_FETCH_POSTS =
  process.env.DISABLE_FETCH_POSTS || false;

export const DISABLE_FETCH_COMMENTS =
  process.env.DISABLE_FETCH_COMMENTS || false;

// bootstrap db with some users
export const TEST_USER_PUBKEYS = [
  "f301891b7e41b107beefe91a133d6efa8c7b0dfe0f5e39650c34b8311c365d39", // pj
  "7bc0ad743a775ae3f4b645a9d3f25a9cbb8a38ec8da59117c003e2b1bbdeb003", // test
  "4e16d7778b5608209108d8c0ca2ed679c60918a60c4348ead4889f64012c7775", // test
  "5ee727156f6e2293dcd9f6c1b3a1287c9e3e369bb7fbb5e77f9261bc3d13f591", // test
  "6b5fe0dfbf08e36431205afc808f59f4770581c0aead10f6121b2c60329c4d2e", // test
  "3be69f4f4870c2963aa3c9820719edddc7a34eec52085f079bb105f171ffe29c", // test
  "2da90b1709dbafed6989dcab767fcee275e0d8646937d792a4bbee3b66ccb812", // test
  "976354ad6f468cbf4ade859f2e95d3a5e1502ac37c2f5503256c8b01e1ed49e6", // test
  "d448f1562c20dbafa42badd9f88560cd1adb2f177b30f0aa048cb243e55d37bd", // redsolv
  "611f0e3730c028d618362aaaa19b00aa50bdf31480c627baf006abcc88f1c97a", // redsolv
  "a79dacfd8d58c701eb3572eb417ee524795cc0231a646f93abdb8f5f1a2048cc", // stelb
]
