// Module-level formatter config. ExperienceProvider updates it and remounts the tree when it changes.
let cfg = { locale: "en-AU", timeZone: undefined as string | undefined };

export function setFormatConfig(locale: string, timeZone?: string) {
  cfg = { locale, timeZone };
}
export function getFormatConfig() {
  return cfg;
}

function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function dtf(opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(cfg.locale, { ...opts, timeZone: opts.timeZone ?? cfg.timeZone });
  } catch {
    return new Intl.DateTimeFormat(cfg.locale, opts);
  }
}

export function formatDate(v: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }): string {
  const d = toDate(v);
  // Source-check/review calendar dates are not UTC instants. Do not move them to
  // the previous/next day when the member changes time zones.
  if (d && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))
    return new Intl.DateTimeFormat(cfg.locale, { ...opts, timeZone: "UTC" }).format(d);
  return d ? dtf(opts).format(d) : "";
}

export function formatDateTime(v: string | number | Date | null | undefined, timeZone?: string): string {
  const d = toDate(v);
  return d ? dtf({ dateStyle: "medium", timeStyle: "short", timeZone }).format(d) : "";
}

export function formatTime(v: string | number | Date | null | undefined, timeZone?: string): string {
  const d = toDate(v);
  return d ? dtf({ timeStyle: "short", timeZone }).format(d) : "";
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
];

export function formatRelative(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  const secs = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(cfg.locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size) return rtf.format(Math.trunc(secs / size), unit);
  }
  return rtf.format(0, "second");
}
