import type { Profile } from "@workspace/db";

export const PROFILE_FIELDS = ["preferredName", "photoPath", "biography", "language", "broadRegion", "interests", "dementiaConnection", "roles"] as const;
export type ProfileField = typeof PROFILE_FIELDS[number];
export type Audience = "private" | "connections" | "members";

export function defaultVisibility(): Record<ProfileField, Audience> {
  return {
    preferredName: "members", photoPath: "private", biography: "private", language: "private",
    broadRegion: "private", interests: "private", dementiaConnection: "private", roles: "private",
  };
}

export function visibleProfile(profile: Profile, viewer: "owner" | "member" | "connection" | "anonymous", viewerId?: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    const audience = (profile.visibility?.[field] ?? "private") as Audience;
    const selected = profile.selectedFriends?.[field];
    const restricted = profile.friendPermissions?.[viewerId ?? ""]?.view === false;
    const inSelection = selected == null || (viewer === "connection" && !!viewerId && selected.includes(viewerId));
    const allowed = viewer === "owner" || (!restricted && inSelection &&
      ((viewer === "connection" && audience !== "private") || (viewer === "member" && audience === "members")));
    if (allowed) result[field] = profile[field as keyof Profile];
  }
  return {
    id: profile.id,
    memberId: viewer === "owner" ? profile.memberId : undefined,
    discoverable: viewer === "owner" ? profile.discoverable : undefined,
    visibility: viewer === "owner" ? profile.visibility : undefined,
    friendPermissions: viewer === "owner" ? profile.friendPermissions : undefined,
    selectedFriends: viewer === "owner" ? profile.selectedFriends : undefined,
    ...result,
  };
}

export function canDiscover(profile: Pick<Profile, "discoverable">): boolean { return profile.discoverable === true; }
export function isSelfRoleAuthority(_role: string): false { return false; }
export function isOwnedProfilePhotoPath(memberId: string, path: string): boolean {
  return path.startsWith(`/objects/profile-photos/${memberId}/`) &&
    /^\/objects\/profile-photos\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(path);
}
export function isAssistedAccessInput(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["delegate", "relativeAccount", "relativeId", "delegateId", "actingFor"].some((key) => key in record);
}
export function cardPayloadIsTextOnly(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.text === "string" && !Object.keys(record).some((key) => ["photo", "audio", "media", "mediaUrl", "attachment"].includes(key));
}