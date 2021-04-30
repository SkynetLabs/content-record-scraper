import { watchUsers } from "./watch_users";
import { ENABLE_USER_DISCOVERY } from '../consts';

export async function init(): Promise<void> {
  console.log(`${new Date().toLocaleString()}: Starting watchers`);
  
  // tslint:disable-next-line: no-floating-promises
  if (ENABLE_USER_DISCOVERY) {
    await watchUsers()
  }
}
