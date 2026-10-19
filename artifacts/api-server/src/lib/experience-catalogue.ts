// English regional formats share the existing English interface. This is an
// engineering release review, NOT an independent linguistic/clinical certification.
const reviewDate = "2026-10-19";
export const locales = [
  ...[
    ["en-AU", "English (Australia)"], ["en-GB", "English (United Kingdom)"], ["en-US", "English (United States)"],
  ].map(([code, label]) => ({ code, label, direction: "ltr", enabled: true, reviewedAt: reviewDate,
    reviewNote: "Existing English interface and new experience strings: engineering-reviewed release baseline. No claim of independent clinical translation certification.",
    moderationCoverage: "English text intake rules and human reporting/review. Automated rules are incomplete; uncertain media stays held. Regional formats do not add a new moderation language." })),
  ...[["ar", "العربية"], ["es", "Español"], ["fr", "Français"]].map(([code, label]) => ({
    code, label, direction: code === "ar" ? "rtl" : "ltr", enabled: false, reviewedAt: null,
    reviewNote: "Not enabled: full interface review and operational moderation coverage are not established.",
    moderationCoverage: "Not established. Do not treat an English review as coverage for this language.",
  })),
];
export const countries = [{ code: "AU", name: "Australia" }, { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" }];
export const defaultExperience = { locale: "en-AU", timeZone: "Australia/Sydney", direction: "auto" as const,
  lowData: true, textFirst: true, offlineDrafts: false, country: "AU" };
export const enabledLocale = (code: string) => locales.some(l => l.code === code && l.enabled && l.reviewedAt && l.moderationCoverage);
export function validTimeZone(zone: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); return zone.length <= 100; } catch { return false; }
}
const checkedAt = "2026-10-19";
const resource = (id: string, country: string, name: string, kind: "emergency" | "dementia", phone: string,
  sourceUrl: string, hours: string, hoursTimeZone: string, notes: string) =>
  ({ id, country, name, kind, phone, url: sourceUrl, sourceUrl, hours, hoursTimeZone, checkedAt, notes });
export const countryResources = [
  resource("au-emergency", "AU", "Triple Zero — police, fire, ambulance", "emergency", "000",
    "https://www.infrastructure.gov.au/media-communications/phone/triple-zero", "Emergency telephone service, day and night", "Australia",
    "For life-threatening or time-critical situations. No mobile-network coverage means a mobile call cannot connect. 106 is the TTY emergency service; 000 does not accept SMS."),
  resource("au-dementia", "AU", "Dementia Australia — National Dementia Helpline", "dementia", "1800 100 500",
    "https://www.dementia.org.au/get-support/national-dementia-helpline", "Telephone: 24 hours a day, 7 days a week, 365 days a year", "All Australian time zones",
    "Free confidential dementia information and support for people in Australia; not an emergency dispatch service."),
  resource("gb-emergency", "GB", "Emergency ambulance, police and fire", "emergency", "999",
    "https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/", "Emergency telephone service, day and night", "Europe/London",
    "For life-threatening emergencies. Me does not answer or monitor emergency calls."),
  resource("gb-dementia", "GB", "Alzheimer’s Society — Dementia Support Line", "dementia", "0333 150 3456",
    "https://www.alzheimers.org.uk/get-support/dementia-support-line", "Mon–Wed 09:00–20:00; Thu–Fri 09:00–17:00; Sat–Sun 10:00–16:00", "Europe/London",
    "UK local time, including daylight-saving changes. Check the provider for holiday exceptions. Relay UK: 18001 then 0333 150 3456. Interpreter callbacks can be arranged."),
  resource("us-emergency", "US", "Emergency dispatch", "emergency", "911",
    "https://www.911.gov/calling-911/", "Emergency telephone service, day and night", "United States — local service",
    "Dial 911 in an emergency and give your location. Calling/text availability depends on your local emergency service."),
  resource("us-dementia", "US", "Alzheimer’s Association — 24/7 Helpline", "dementia", "+1 800 272 3900",
    "https://www.alz.org/help-support/resources/helpline", "Telephone: 24 hours a day, 7 days a week, 365 days a year", "All US time zones",
    "Telephone hours are not live-chat hours. Live chat is typically Mon–Sat 07:00–19:00 Central Time. Dial 711 for telecommunications relay."),
];
export const resourceDisclaimer = "Me is not an emergency service and does not monitor this page or dispatch help. Choose the country you are physically in; your language or time zone does not establish your location. Hours and numbers can change: check the original source. Source review does not verify every claim.";
