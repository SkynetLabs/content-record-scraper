require('dotenv').config()

export const MONGO_CONNECTION_STRING = process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost:27017'
export const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'content-record'

export const CR_DATA_DOMAIN = process.env.CR_DATA_DOMAIN || 'contentrecord.hns'

export const SKYNET_PORTAL_URL = 'https://siasky.net'