export const personas = ["person-living-with-dementia", "family-carer", "ordinary-member", "group-moderator", "education-editor"];
export const platforms = ["desktop", "native-ios", "native-android"];
export const requirements = [
  ...personas.flatMap(persona => platforms.map(platform => `journey.${persona}.${platform}`)),
  "beta-consent", "independent-security", "security-regressions", "automated-accessibility",
  "real-user-accessibility", "media-load", "unreliable-networks", "os-lifecycle",
  "moderation-backlog", "backup-restore", "support-coverage", "production-fixtures",
  "disabled-incomplete-features", "regional-approvals",
];

/** Missing, partial, stale or future evidence cannot become a release pass. */
export function assessRelease(register, targets, now = new Date()) {
  const blockers = [];
  if (!register || register.schemaVersion !== 1 || !Array.isArray(register.evidence) || !Array.isArray(register.issues)) {
    throw new Error("Invalid release evidence register");
  }
  if (!targets || targets.schemaVersion !== 1 || !Number.isFinite(Date.parse(targets.setAt)) ||
      !targets.metrics || !Object.keys(targets.metrics).length) throw new Error("Targets must be set before assessment");
  if (Date.parse(targets.setAt) > +now) blockers.push("Targets are future-dated");
  const seen = new Set();
  for (const item of register.evidence) {
    if (!requirements.includes(item.id) || seen.has(item.id)) throw new Error(`Unknown/duplicate evidence key: ${item.id}`);
    seen.add(item.id);
    if (!["pass", "fail", "partial", "blocked", "not-run"].includes(item.status)) throw new Error(`Invalid status: ${item.id}`);
  }
  for (const id of requirements) {
    const item = register.evidence.find(x => x.id === id);
    const at = Date.parse(item?.observedAt);
    if (!item || item.status !== "pass") { blockers.push(`${id}: ${item?.status ?? "missing"}`); continue; }
    if (!item.owner?.trim() || !item.reference?.trim() || !item.method?.trim() || !Number.isFinite(at) ||
        at > +now || +now - at > 30 * 86_400_000) blockers.push(`${id}: incomplete, future or expired evidence`);
    if (id === "independent-security" && item.method !== "independent-human-review") blockers.push("Independent security requires an external human review, not AI or scanners");
    if (id === "beta-consent" && item.method !== "consented-beta") blockers.push("Beta consent is not proven by a synthetic account");
    if (id === "real-user-accessibility" && item.method !== "consented-real-user-review") blockers.push("Real-user accessibility cannot be replaced by automation");
    if (/\.native-(ios|android)$/.test(id) && item.method !== "physical-device") blockers.push(`${id}: browser emulation is not native-device evidence`);
  }
  for (const [key, target] of Object.entries(targets.metrics)) {
    if (!Number.isFinite(target.limit) || target.limit < 0 || !["max", "min"].includes(target.direction) ||
        !Number.isInteger(target.minSamples) || target.minSamples < 1) throw new Error(`Invalid target: ${key}`);
    const result = register.measurements?.[key];
    if (!result || !Number.isFinite(result.value) || result.value < 0 ||
        !Number.isInteger(result.samples) || result.samples < target.minSamples ||
        !result.reference || !Number.isFinite(Date.parse(result.observedAt)) ||
        Date.parse(result.observedAt) < Date.parse(targets.setAt) || Date.parse(result.observedAt) > +now ||
        +now - Date.parse(result.observedAt) > 30 * 86_400_000) { blockers.push(`${key}: missing/current representative measurement required`); continue; }
    if (target.direction === "max" ? result.value > target.limit : result.value < target.limit) blockers.push(`${key}: target missed`);
  }
  for (const issue of register.issues) {
    if (!issue.id || !issue.owner || !issue.nextAction || !["critical", "high", "medium", "low"].includes(issue.severity) ||
        !["open", "contained", "fixed", "accepted"].includes(issue.status)) throw new Error("Every issue requires severity, owner, status and next action");
    if (issue.status === "fixed" && !issue.resolutionReference) blockers.push(`${issue.id}: fix lacks verification evidence`);
    if (["critical", "high"].includes(issue.severity) && issue.status !== "fixed") blockers.push(`${issue.id}: unresolved ${issue.severity} (${issue.status})`);
  }
  return { recommendation: blockers.length ? "NO-GO" : "READY FOR INDEPENDENT SIGN-OFF",
    blockers, automaticReleaseApproval: false };
}
