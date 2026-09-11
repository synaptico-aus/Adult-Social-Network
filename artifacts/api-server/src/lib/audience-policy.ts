export const CONTENT_AUDIENCES = ["only_me", "friends", "this_group", "my_circle", "selected_communities", "public"] as const;
export type ContentAudience = typeof CONTENT_AUDIENCES[number];
export type AudienceViewer = { authenticated: boolean; owner?: boolean; friend?: boolean; inGroup?: boolean; inCircle?: boolean; inSelectedCommunity?: boolean };

/** Shared server policy. Anonymous viewers can only see content explicitly marked public. */
export function canViewAudience(audience: ContentAudience, viewer: AudienceViewer): boolean {
  if (audience === "public") return true;
  if (!viewer.authenticated) return false;
  if (audience === "only_me") return viewer.owner === true;
  if (audience === "friends") return viewer.owner || viewer.friend === true;
  if (audience === "this_group") return viewer.owner || viewer.inGroup === true;
  if (audience === "my_circle") return viewer.owner || viewer.inCircle === true;
  return viewer.owner || viewer.inSelectedCommunity === true;
}

export function validateAudience(value: unknown): value is ContentAudience {
  return typeof value === "string" && (CONTENT_AUDIENCES as readonly string[]).includes(value);
}