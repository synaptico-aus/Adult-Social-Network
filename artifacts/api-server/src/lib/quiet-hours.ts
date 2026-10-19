export const validQuietTime = (time: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
export type QuietHours = { quietHoursEnabled: boolean; quietHoursStart: string | null;
  quietHoursEnd: string | null; quietHoursTimezone: string | null };
/** Wall-clock hours in the explicitly selected zone, including DST transitions. */
export function inQuietHours(preferences: QuietHours, date = new Date()) {
  if (!preferences.quietHoursEnabled || !preferences.quietHoursStart ||
    !preferences.quietHoursEnd || !preferences.quietHoursTimezone) return false;
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: preferences.quietHoursTimezone,
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  const minutes = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  const now = minutes(hhmm), start = minutes(preferences.quietHoursStart), end = minutes(preferences.quietHoursEnd);
  return start === end || (start < end ? now >= start && now < end : now >= start || now < end);
}
