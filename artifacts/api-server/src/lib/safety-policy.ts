export function isOwnSafetyRecord(actorMemberId: string, signedInMemberId: string): boolean {
  return actorMemberId === signedInMemberId;
}