export const storeRequirements = [
  "native-ios", "native-android", "apple-signing", "google-signing",
  "sdk-binary-audit", "apple-privacy-labels", "google-data-safety",
  "age-ratings", "sign-in-assessment", "published-policies", "account-deletion",
  "reviewer-isolation", "review-backend", "ios-testflight", "android-testing",
  "desktop-journeys", "crash-monitoring", "staff-incident-coverage",
  "rollback-restore", "regions-languages", "accurate-screenshots", "permissions",
  "branding", "listing-accuracy",
];

// This validates a configuration value, not reachability, DNS or SSRF safety.
// The preparation command never fetches URLs supplied in this manifest.
export function publicHttps(value) {
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase().replace(/\.$/, "");
    return u.protocol === "https:" && !u.username && !u.password &&
      !u.search && !u.hash && !u.port && h.includes(".") &&
      !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) &&
      !/[:[\]]/.test(h) && !/^\d+(\.\d+){3}$/.test(h) && !/\.(local|internal|invalid|test)$/.test(h) &&
      !/(^|\.)example\.(com|org|net)$/.test(h) && !h.endsWith(".replit.dev");
  } catch { return false; }
}

export function assertNoSecretFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/password|private.?key|secret|credential|access.?token|recovery.?code/i.test(key)) {
      throw new Error(`Do not store credentials in the submission manifest: ${key}`);
    }
    assertNoSecretFields(child);
  }
}

export function assessStore(config, phase17, now = new Date()) {
  assertNoSecretFields(config);
  if (config?.schemaVersion !== 1 || !Array.isArray(config.evidence)) throw new Error("Invalid Phase 18 manifest");
  const blockers = [];
  const reviewed = Date.parse(config.policyCheckedAt);
  if (!Number.isFinite(reviewed) || reviewed > +now || +now - reviewed > 30 * 86400000) {
    blockers.push("Refresh official store requirements within 30 days and again immediately before upload");
  }
  if (phase17?.recommendation !== "READY FOR INDEPENDENT SIGN-OFF" || phase17?.blockers?.length !== 0) {
    blockers.push("Phase 17 remains NO-GO; do not submit an incomplete product");
  }
  const seen = new Set();
  for (const e of config.evidence) {
    if (!storeRequirements.includes(e.id) || seen.has(e.id)) throw new Error(`Unknown/duplicate store evidence: ${e.id}`);
    if (!["pass", "partial", "blocked", "not-run", "fail"].includes(e.status) || !e.owner || !e.reference) {
      throw new Error(`Store evidence needs status, owner and reference: ${e.id}`);
    }
    seen.add(e.id);
  }
  for (const id of storeRequirements) {
    const e = config.evidence.find(row => row.id === id);
    const at = Date.parse(e?.observedAt);
    if (e?.status !== "pass" || !e.method || !Number.isFinite(at) || at > +now || +now - at > 30 * 86400000) {
      blockers.push(`${id}: current verified evidence required`);
    }
  }
  for (const [key, value] of Object.entries(config.urls ?? {})) {
    if (!publicHttps(value)) blockers.push(`${key}: stable public HTTPS URL and verified service required`);
  }
  for (const key of ["reviewBackend", "support", "privacy", "terms", "community", "accountDeletion", "childSafetyStandards"]) {
    if (!(key in (config.urls ?? {}))) blockers.push(`${key}: URL missing`);
  }
  for (const key of ["legalEntity", "copyrightOwner", "supportEmail", "privacyEmail", "incidentContactReference", "childSafetyContactReference"]) {
    const value = config.owner?.[key];
    if (typeof value !== "string" || !value.trim()) blockers.push(`${key}: owner input required`);
    else if (key.endsWith("Email") && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /@example\./i.test(value))) {
      blockers.push(`${key}: real contact required`);
    }
  }
  const n = config.native ?? {};
  for (const key of ["iosProject", "androidProject", "bundleIdentifier", "packageName", "appleTeamReference",
    "playDeveloperAccountReference", "iosSignedArtifact", "androidSignedArtifact"]) {
    if (typeof n[key] !== "string" || !n[key].trim()) blockers.push(`${key}: native/signing dependency unresolved`);
  }
  if (n.bundleIdentifier && !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(n.bundleIdentifier)) blockers.push("Invalid Apple bundle identifier");
  if (n.packageName && !/^[A-Za-z]\w*(?:\.[A-Za-z]\w*)+$/.test(n.packageName)) blockers.push("Invalid Android package name");
  const l = config.listing ?? {};
  if (!l.name || l.name.length > 30 || !l.appleSubtitle || l.appleSubtitle.length > 30 ||
      !l.googleShortDescription || l.googleShortDescription.length > 80 ||
      !l.description || l.description.length > 4000 || /draft description/i.test(l.description)) {
    blockers.push("Complete accurate final listing text within store limits");
  }
  if (l.eligibilityMinimumAge !== 18) blockers.push("Preserve Me's own 18+ eligibility policy");
  if (!l.appleAssignedRating || !l.googleIarcRating) blockers.push("Complete separate Apple and IARC rating questionnaires; do not infer from eligibility");
  if (!l.screenshots?.length || !["ios", "android"].every(platform => l.screenshots.some(s => s.platform === platform)) ||
      l.screenshots.some(s => !s.path || !["ios", "android"].includes(s.platform) ||
      !/^[a-f0-9]{64}$/i.test(s.buildDigest ?? "") || !s.device || !s.reviewer || s.kind !== "native-capture" ||
      !Number.isFinite(Date.parse(s.observedAt)) || Date.parse(s.observedAt) > +now ||
      +now - Date.parse(s.observedAt) > 30 * 86400000)) {
    blockers.push("Native release-specific screenshot evidence missing");
  }
  const rollout = config.rollout ?? {};
  if (!rollout.approvedCountries?.length || !rollout.supportedInterfaceLocales?.length) blockers.push("Approve specific launch regions and supported languages");
  if (rollout.supportedInterfaceLocales?.some(l => !["en-AU", "en-GB", "en-US"].includes(l))) {
    blockers.push("New language requires a reviewed interface and established moderation coverage");
  }
  return {
    assessedAt: now.toISOString(),
    recommendation: blockers.length ? "NOT READY FOR SUBMISSION" : "READY FOR OWNER SUBMISSION DECISION",
    automaticSubmission: false,
    automaticRelease: false,
    ownerSubmissionAuthorised: rollout.submissionAuthorised === true,
    ownerReleaseAuthorised: rollout.publicRolloutAuthorised === true,
    blockers,
  };
}
