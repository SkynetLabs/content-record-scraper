import { Collection } from 'mongodb';
import { SkynetClient } from 'skynet-js';
import { CONTENTRECORD_DAC_DATA_DOMAIN, DEBUG_ENABLED, FEED_DAC_DATA_DOMAIN, SOCIAL_DAC_DATA_DOMAIN } from '../consts';
import { COLL_EVENTS, COLL_USERS } from '../database';
import { MongoDB } from '../database/mongodb';
import { EventType, IEvent, IUser } from '../types';
import { IDictionary, Throttle } from '../types';
import { downloadFile, settlePromises } from './utils';

// fetchSkapps is a simple scraping algorithm that scrapes all known users
// for new skapps those users have been using.
export async function fetchSkapps(database: MongoDB, client: SkynetClient, throttle: Throttle<number>): Promise<number> {
  // fetch all collections
  const usersDB = await database.getCollection<IUser>(COLL_USERS);
  const eventsDB = await database.getCollection<IEvent>(COLL_EVENTS);
  
  // fetch a user cursor
  const userCursor = usersDB.find().sort({$natural: -1});

  // loop every user and kickstart an indexation
  const promises = [];
  while (await userCursor.hasNext()) {
    const user = await userCursor.next();
    const promise = throttle(fetchNewSkapps.bind(
      null,
      client,
      usersDB,
      user,
    ))()

    // catch unhandled promise rejections but don't handle the error, we'll
    // process the error when all promises were settled
    //
    // tslint:disable-next-line: no-empty
    promise.catch((err) => { if (DEBUG_ENABLED) { console.log(err.message) }})
    promises.push(promise)
  }

  // wait for all promises to be settled
  return await settlePromises(
    eventsDB,
    EventType.FETCHSKAPPS_ERROR,
    promises,
    'fetchSkapps'
  );
}

export async function fetchNewSkapps(
  client: SkynetClient,
  userDB: Collection<IUser>,
  user: IUser,
): Promise<number> {
  // define some variables
  const {
    userPK,
    skapps,
    cachedDataLinks
  } = user

  // map all the skapnames
  const map = {};
  for (const skapp of skapps) {
    map[skapp] = true
  }

  let added = 0;

  const dacDataDomains = [
    CONTENTRECORD_DAC_DATA_DOMAIN,
    FEED_DAC_DATA_DOMAIN,
    SOCIAL_DAC_DATA_DOMAIN
  ]
  
  const cachedDataLinksUpdates = {};
  for (const domain of dacDataDomains) {
    // download the dictionary
    const path = `${domain}/skapps.json`
    const { data: dict, cached, dataLink } = (await downloadFile<IDictionary<string | boolean>>(
      client,
      userPK,
      path,
      cachedDataLinks[path]
      ));
    if (!dict || cached) {
      continue;
    }

    // update the cached data link    
    cachedDataLinksUpdates[path] = dataLink;

    // loop all of the skapps and add the ones we're missing
    for (const skapp of Object.keys(dict)) {
      if (!map[skapp]) {
        added++;
        skapps.push(skapp)
      }
    }
  }

  // update the user object if skapps were added
  if (added) {
    // refetch so we don't overwrite cached links
    user = await userDB.findOne({ userPK })
    await userDB.updateOne(
      { userPK },
      {
        $set: {
          skapps,
          cachedDataLinks: {
            ...user.cachedDataLinks,
            ...cachedDataLinksUpdates,
          },
        }
      }
    )
  }
  
  return added;
}
