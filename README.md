# Content Record Scraper

## Introduction

This repository contains a scraper that will scrape information from the Content
Record DAC. It will periodically download the index and page files used by the
Content Record and persist those in a Mongo database.

## Data Model

In the mongo database there will be three collections: 
- `content`
- `interactions`
- `users`

In the `content` collection we keep track of all of the content that gets
created, in the `interactions` collection we keep track of all the interactions
that occur with that content. In the `users` collection we keep track of all the
users and we also keep state. This state prevents the scraper from unnecessarily
re-indexing already indexed content and/or interactions.

The users are very important as they will need to be feeded to the scraper. The
scraper does not extend its user base on its own, it will only scan the content
records for the users it knows, and keep those up-to-date.

## Architecture 

The scraper is built around two cronjobs:
- fetch skapps
- fetch entries

`Fetch skapps` one has only one job which is to update the user's skapp list. This
list of skapp names is kept in a separate json file by the content record DAC.
We periodically download that and update the user object in our database.

`Fetch entries` is slightly more involved, it will update two collections and
will potentially download a bunch of index and page files. The content record
DAC keeps an index file that points to a fanout file called a page. The scraper
will internally keep track of its latest sync offsets. It does this for both the
new content entries and interaction entries. The algorithm itself is simple, it
will simply download new entries from its previous offset, to the current
offset. When it is done it will update the user's state in the database. This
ensures that restarting the scraper does not mean we have to re-index.

**NOTE**: it is perfectly possible to reset the state or re-index by doing
manual queries on the mongo database, or simply throw it away alltogether

## Environment Variables

The scraper needs some environment variables set to be able to run. If you want
to run the scraper using non-default settings, be sure to update these, the
scraper will log its current env variables when it boots.

- **MONGO_CONNECTION_STRING**: defaults to `mongodb://localhost:27017`
- **MONGO_DB_NAME**: defaults to `content-record`
- **CR_DATA_DOMAIN**: defaults to `contentrecord.hns`
- **SKYNET_PORTAL_URL**: defaults to `https://siasky.net`

## Usage

There's a script you can run to start the scraper with. It's located in the
`scripts` directory under `start.sh`. There's also a `Dockerfile` should you
want to run the scraper as a docker container.
