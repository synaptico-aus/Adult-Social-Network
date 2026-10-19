import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRelease, requirements } from "./policy.mjs";
const now = new Date("2026-10-19T12:00:00Z");
const targets = { schemaVersion: 1, setAt: "2026-10-19T10:00:00Z", metrics: { latency: { limit: 1000, direction: "max", minSamples: 100 } } };
function register() {
  return { schemaVersion: 1, issues: [], measurements: { latency: { value: 200, samples: 100, reference: "synthetic regression fixture", observedAt: now.toISOString() } },
    evidence: requirements.map(id => ({ id, status: "pass", owner: "Synthetic test fixture owner", reference: "Synthetic policy test, not real release evidence", observedAt: now.toISOString(),
      method: id === "independent-security" ? "independent-human-review" : id === "beta-consent" ? "consented-beta" : id === "real-user-accessibility" ? "consented-real-user-review" : /\.native-/.test(id) ? "physical-device" : "test" })) };
}
test("missing evidence never becomes an automatic success", () => {
  const report = assessRelease({ schemaVersion: 1, issues: [], evidence: [], measurements: {} }, targets, now);
  assert.equal(report.recommendation, "NO-GO"); assert.equal(report.automaticReleaseApproval, false);
});
test("even complete synthetic policy fixtures require independent sign-off", () => {
  assert.equal(assessRelease(register(), targets, now).recommendation, "READY FOR INDEPENDENT SIGN-OFF");
});
test("AI review, browser emulation and future/expired evidence cannot satisfy human/native gates", () => {
  for (const [id, method] of [["independent-security", "AI"], ["beta-consent", "synthetic"], ["real-user-accessibility", "axe"], ["journey.ordinary-member.native-ios", "emulation"]]) {
    const r = register(); r.evidence.find(x => x.id === id).method = method;
    assert.equal(assessRelease(r, targets, now).recommendation, "NO-GO");
  }
  for (const date of ["2026-10-20T00:00:00Z", "2025-01-01T00:00:00Z", "invalid"]) {
    const r = register(); r.evidence[0].observedAt = date;
    assert.equal(assessRelease(r, targets, now).recommendation, "NO-GO");
  }
});
test("contained high defects, missing owners and duplicate evidence cannot pass", () => {
  const r = register(); r.issues.push({ id: "synthetic-only", severity: "high", status: "contained", owner: "Test", nextAction: "Fix" });
  assert.equal(assessRelease(r, targets, now).recommendation, "NO-GO");
  r.issues[0].owner = ""; assert.throws(() => assessRelease(r, targets, now));
  const duplicate = register(); duplicate.evidence.push(duplicate.evidence[0]);
  assert.throws(() => assessRelease(duplicate, targets, now));
});
test("targets cannot be passed using undersampled, pre-target, missing or failing measurements", () => {
  for (const change of [{ samples: 1 }, { observedAt: "2026-10-19T09:00:00Z" }, { value: 2000 }, { value: null }]) {
    const r = register(); Object.assign(r.measurements.latency, change);
    assert.equal(assessRelease(r, targets, now).recommendation, "NO-GO");
  }
});
