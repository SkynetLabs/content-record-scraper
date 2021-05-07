# Content Record Scraper

## Introduction

This repository contains a scraper that will scrape information from several
different DACs:

- Content Record DAC
- Feed DAC
- Social DAC

 It will periodically download the index and page files used by these DACs and
 persist whatever content is in them into a Mongo database. By doing so we
 essentially collect a database of content and users, and have all the means to
 discover relationships between them. Which user is creating the most content,
 which skapp is most popular, what user interacts with what type of content and
 so on.

## Data Model

In the mongo database there will be three collections:

- **entries**:

In the `entries` collection we keep track of all of the content that gets
created, alongside all the interactions that occur with that content. In the
`users` collection we keep track of all the users and we also keep state. This
state prevents the scraper from unnecessarily re-indexing already indexed
content and/or interactions.

- **events**:

The `events` collection is only there for debugging purposes and contains some
extra information about how the scraper is performing. Things like duration,
errors, amount of entities added and so on. This collection automatically
removes entries older than a week to ensure this collection does not perpetually
grows in size.

- **users**:

The users are very important as they will need to be feeded to the scraper. The
scraper does not extend its user base on its own, it will only scan the content
records for the users it knows, and keep those up-to-date.

- **lists**:

The `lists` collection contains several allow- and blocklist that provide us
the flexibility of allowing or blocking certain skapps and or users.

## Architecture

The scraper is built around a series of cronjobs that scrape the entries from
the Content Record DAC and the Feed DAC. Therefore we currently have the
following cronjobs:

- fetch skapps
- fetch user profiles
- fetch skyfeed users
- fetch comments (Feed DAC)
- fetch posts  (Feed DAC)
- fetch new content (CR DAC)
- fetch interactions (CR DAC)

The cronjobs run every 15 minutes, however they are guarded by a mutex so if a
cron is not finished after 15 minutes, it will not spin a new worker, instead it
will wait until the next iteration.

`Fetch skapps` one has only one job which is to update the user's skapp list. This
list of skapp names is kept in a separate json file by the content record DAC.
We periodically download that and update the user object in our database.

`Fetch new content` is slightly more involved, but simply put will scrape all
users in the user DB and look for new content entries and add them. The content
record DAC keeps an index file that points to a fanout file called a page. The
scraper will internally keep track of its latest sync offsets.

The algorithm itself is simple, it will simply download new entries from its
previous offset, to the current offset. When it is done it will update the
user's state in the database. This ensures that restarting the scraper does not
mean we have to re-index.

`Fetch new interactions` is identical to the fetching new content, it will just
keep track of different offsets in the user object.

**NOTE**: it is perfectly possible to reset the state or re-index by doing
manual queries on the mongo database, or simply throw it away alltogether

## Environment Variables

The scraper needs some environment variables set to be able to run. If you want
to run the scraper using non-default settings, be sure to update these, the
scraper will log its current env variables when it boots.

- **MONGO_CONNECTION_STRING**: defaults to `mongodb://localhost:27017`
- **MONGO_DB_NAME**: defaults to `content-record`
- **CONTENTRECORD_DAC_DATA_DOMAIN**: defaults to `contentrecord.hns`
- **SKYNET_PORTAL_URL**: defaults to `https://siasky.net`

Arguably the most important environment variable is:

- **SKYNET_JWT**

set that to your accounts cookie to ensure the scraper is using your account,
and is not ratelimited. Without an account this scraper won't perform as good,
if you do decide to run it without an account, please adjust the API rate
limits, defined in `crons/index.ts:34`.

The following variables allow temporarily disabling some of the crons.

- **DISABLE_FETCH_USER_PROFILES**
- **DISABLE_FETCH_SKYFEED_USERS**
- **DISABLE_FETCH_SKAPPS**
- **DISABLE_FETCH_NEW_CONTENT**
- **DISABLE_FETCH_INTERACTIONS**
- **DISABLE_FETCH_POSTS**
- **DISABLE_FETCH_COMMENTS**

If you run the scraper with the following environment variable, it will alter
the cron time to run every job every minute.

- **DEBUG_ENABLED**

To scrape the DACs we need to specify the data domains. These variables will
default to the correct domain, but for debugging purposes it can be useful to
alter these:

- **CONTENTRECORD_DAC_DATA_DOMAIN**
- **FEED_DAC_DATA_DOMAIN**
- **MYSKY_PROFILE_DAC_DATA_DOMAIN**

## Usage

```shell
docker-compose up -d
npm run start
```

If you want to develop or debug manually, you can comment out the scraper
service and connect only to mongo. Then however you have to start the scraper
manually by executing `start.sh` in `scripts`.

NOTE: the scraper runs off of user data that needs to be feeded to the scraper.
That data are users, so there is a user discovery part that is not included in
the scraper, instead there's another process that simply inserts an empty user
object in the database, which gets picked up by the scraper from there on out.

This is important if you want to debug the scraper. To do so, simply insert a
user record manually. See `utils.ts` for an example of an empty user object.

You can do this through the mongo shell or use a mongo client like Robo3T or
MongoDB Compass. **We bootstrap a bunch of users when the scraper starts.**
