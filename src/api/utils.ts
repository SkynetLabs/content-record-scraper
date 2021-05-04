export function isValidUserPK(userPK: string): boolean {
  if (!userPK || typeof userPK !== "string") {
    return false;
  }

  const regexp = /^(?<userPK>[a-z0-9]{64})$/;
  const matchResult = userPK.match(regexp)
  if (!matchResult || !matchResult.groups.userPK) {
    return false;
  }
  return true;
}
