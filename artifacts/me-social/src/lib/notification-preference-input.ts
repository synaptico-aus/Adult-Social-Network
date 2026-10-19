import type { NotificationPreferencesInput } from "@workspace/api-client-react";
const editableKeys = [
  "inAppMessages", "browserMessages", "nativeMessages", "inAppRequests", "browserRequests", "nativeRequests",
  "inAppGroupActivity", "browserGroupActivity", "nativeGroupActivity", "inAppSafety", "browserSafety", "nativeSafety",
  "quietHoursEnabled", "quietHoursStart", "quietHoursEnd", "quietHoursTimezone", "lockScreenPreview",
] as const;
/** GET rows include server-owned identity/timestamps; never send those in PATCH. */
export function notificationPreferenceInput(row: Record<string, unknown>): NotificationPreferencesInput {
  return Object.fromEntries(editableKeys.filter(k => row[k] !== undefined).map(k => [k, row[k]])) as NotificationPreferencesInput;
}
