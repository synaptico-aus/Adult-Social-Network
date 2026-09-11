export const AGE_POLICY_VERSION = "2026-01";
export const MAX_REAUTH_AGE_MINUTES = 5;
export const ALLOWED_AGE_METHODS = ["self-declaration"] as const;
export const REQUIRED_DOCUMENTS = ["terms", "privacy", "community_guidelines"] as const;
export const currentDocumentVersions = { terms: "2026-01", privacy: "2026-01", community_guidelines: "2026-01" } as const;

export function isAdultEligible(value: boolean): boolean { return value === true; }
export function authenticatedUser(userId: unknown): boolean { return typeof userId === "string" && userId.length > 0; }
export function withinRateLimit(count: number, limit: number): boolean { return count <= limit; }
export function ownsSession(sessionIds: readonly string[], target: string): boolean { return sessionIds.includes(target); }
export function hasCurrentConsent(documents: ReadonlyMap<string, string>): boolean {
  return REQUIRED_DOCUMENTS.every((name) => documents.get(name) === currentDocumentVersions[name]);
}
export function validOnboardingDocuments(documents: ReadonlyArray<{ document: string; version: string }>): boolean {
  const names = documents.map((item) => item.document);
  return names.length === REQUIRED_DOCUMENTS.length &&
    new Set(names).size === REQUIRED_DOCUMENTS.length &&
    hasCurrentConsent(new Map(documents.map((item) => [item.document, item.version])));
}
/** Clerk fva values are factor verification ages in minutes, not timestamps. */
export function freshFactorAge(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_REAUTH_AGE_MINUTES;
}
export function freshFirstFactor(fva: unknown): boolean { return Array.isArray(fva) && freshFactorAge(fva[0]); }
export function freshSecondFactor(fva: unknown): boolean { return Array.isArray(fva) && freshFactorAge(fva[1]); }
export function isStaff(privateMetadata: unknown, fva: unknown): boolean {
  return typeof privateMetadata === "object" && privateMetadata !== null &&
    (privateMetadata as { role?: unknown }).role === "staff" && freshSecondFactor(fva);
}
export function acceptOneTimeRecovery(assertion: { accountId?: unknown; expiresAt: number; used: boolean } | null, now = Date.now()) {
  if (!assertion || assertion.used || assertion.expiresAt <= now || typeof assertion.accountId !== "string") return { accepted: false as const };
  return { accepted: true as const, accountId: assertion.accountId };
}