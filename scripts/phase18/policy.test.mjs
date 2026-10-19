import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { assessStore, publicHttps, storeRequirements } from "./policy.mjs";

const now = new Date("2026-10-19T12:00:00Z");
const phase17Fixture = { recommendation: "READY FOR INDEPENDENT SIGN-OFF", blockers: [] };
// Fictional UNIT fixtures only. Never written to the actual evidence manifest.
function fixture() {
  return {
    schemaVersion: 1, policyCheckedAt: "2026-10-19",
    owner: { legalEntity: "FICTIONAL UNIT FIXTURE", copyrightOwner: "FICTIONAL UNIT FIXTURE",
      supportEmail: "test@fictional-fixture.org", privacyEmail: "test@fictional-fixture.org",
      incidentContactReference: "FICTIONAL PRIVATE REFERENCE", childSafetyContactReference: "FICTIONAL PRIVATE REFERENCE" },
    native: {
      ...Object.fromEntries(["iosProject", "androidProject", "appleTeamReference", "playDeveloperAccountReference",
        "iosSignedArtifact", "androidSignedArtifact"].map(k => [k, "FICTIONAL UNIT REFERENCE"])),
      bundleIdentifier: "org.fictionalfixture.unit",
      packageName: "org.fictionalfixture.unit"
    },
    urls: Object.fromEntries(["reviewBackend", "support", "privacy", "terms", "community", "accountDeletion", "childSafetyStandards"]
      .map(k => [k, "https://fictional-fixture.org/not-a-real-release"])),
    evidence: storeRequirements.map(id => ({ id, status: "pass", owner: "FICTIONAL UNIT OWNER",
      reference: "FICTIONAL UNIT EVIDENCE", method: "UNIT FIXTURE NOT REAL VALIDATION", observedAt: "2026-10-19" })),
    listing: { name: "Me", appleSubtitle: "Connection", googleShortDescription: "FICTIONAL UNIT TEXT",
      description: "FICTIONAL UNIT TEXT", eligibilityMinimumAge: 18, appleAssignedRating: "UNIT", googleIarcRating: "UNIT",
      screenshots: ["ios", "android"].map(platform => ({ path: "unit.png", platform, buildDigest: "a".repeat(64), device: "UNIT", observedAt: "2026-10-19", reviewer: "UNIT", kind: "native-capture" })) },
    rollout: { approvedCountries: ["UNIT"], supportedInterfaceLocales: ["en-AU"], submissionAuthorised: false, publicRolloutAuthorised: false },
  };
}

test("real register remains blocked with signing, account and native dependencies", async () => {
  const actual = JSON.parse(await readFile(new URL("../../docs/store/phase18.json", import.meta.url), "utf8"));
  const r = assessStore(actual, { recommendation: "NO-GO", blockers: ["missing beta evidence"] }, now);
  assert.equal(r.recommendation, "NOT READY FOR SUBMISSION");
  assert.ok(r.blockers.some(b => b.includes("Phase 17")));
  assert.ok(r.blockers.some(b => b.includes("iosSignedArtifact")));
  assert.ok(r.blockers.some(b => b.includes("rating")));
  assert.equal(r.automaticRelease, false);
});
test("even a complete synthetic fixture never submits or releases", () => {
  const result = assessStore(fixture(), phase17Fixture, now);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.recommendation, "READY FOR OWNER SUBMISSION DECISION");
  assert.equal(result.ownerSubmissionAuthorised, false);
  assert.equal(result.automaticSubmission, false);
  assert.equal(result.automaticRelease, false);
});
test("owner authorisation cannot override unmet safety gates", () => {
  const c = fixture(); c.rollout.submissionAuthorised = c.rollout.publicRolloutAuthorised = true;
  assert.equal(assessStore(c, { recommendation: "NO-GO", blockers: ["unsafe"] }, now).recommendation, "NOT READY FOR SUBMISSION");
});
test("missing, stale or future policy/evidence never passes", () => {
  for (const date of [null, "2026-08-01", "2027-01-01"]) {
    const c = fixture(); c.policyCheckedAt = date; c.evidence[0].observedAt = date;
    assert.ok(assessStore(c, phase17Fixture, now).blockers.length >= 2);
  }
});
test("web captures and inferred ratings are rejected", () => {
  const c = fixture(); c.listing.screenshots[0].kind = "web-reference"; c.listing.appleAssignedRating = null;
  const result = assessStore(c, phase17Fixture, now);
  assert.ok(result.blockers.some(b => b.includes("screenshot")));
  assert.ok(result.blockers.some(b => b.includes("questionnaires")));
});
test("dev URLs, placeholder contacts, credential fields and unreviewed languages are rejected", () => {
  for (const url of ["http://site.org", "https://localhost/", "https://127.0.0.1/", "https://10.0.0.1/",
    "https://0.0.0.0/", "https://x.replit.dev/", "https://example.com/", "https://example.com./", "https://u:p@site.org/", "https://site.org/?token=oops"]) assert.equal(publicHttps(url), false);
  const c = fixture(); c.owner.supportEmail = "support@example.com"; c.rollout.supportedInterfaceLocales.push("fr");
  assert.ok(assessStore(c, phase17Fixture, now).blockers.some(b => b.includes("language")));
  assert.ok(assessStore(c, phase17Fixture, now).blockers.some(b => b.includes("contact")));
  c.reviewerPassword = "UNIT NOT A CREDENTIAL";
  assert.throws(() => assessStore(c, phase17Fixture, now), /Do not store credentials/);
});
test("duplicate evidence is a configuration error, not multiple passes", () => {
  const c = fixture(); c.evidence.push(c.evidence[0]);
  assert.throws(() => assessStore(c, phase17Fixture, now), /duplicate/);
});
