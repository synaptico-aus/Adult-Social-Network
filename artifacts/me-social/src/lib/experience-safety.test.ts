import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setFormatConfig, formatDate, formatTime } from "./locale-format";
import { interfaceText } from "./interface-messages";
import { notificationPreferenceInput } from "./notification-preference-input";
import { canRestoreDraftHere } from "./draft-scope";

class TestStorage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
}
Object.defineProperty(globalThis, "localStorage", { value: new TestStorage(), configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: new TestStorage(), configurable: true });
Object.defineProperty(globalThis, "BroadcastChannel", { value: undefined, configurable: true });
Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
const store = await import("./draft-store");
const draft = { body: "Private unsent draft—not for another account", audience: "only_me" };
beforeEach(() => { store.wipeDrafts(null, false); store.setActiveUser("account-a"); });

test("regional English dates and IANA time zones change actual formatted output", () => {
  const instant = new Date("2026-02-03T00:30:00Z");
  setFormatConfig("en-US", "UTC");
  assert.match(formatDate(instant, { dateStyle: "short" }), /^2\/3\//);
  setFormatConfig("en-GB", "UTC");
  assert.match(formatDate(instant, { dateStyle: "short" }), /^03\/02\//);
  assert.match(formatTime(instant), /00:30/);
  setFormatConfig("en-GB", "America/New_York");
  assert.match(formatDate(instant, { dateStyle: "short" }), /^02\/02\//);
  assert.match(formatTime(instant), /19:30/);
  assert.equal(interfaceText("Home"), "Home");
});
test("calendar source-check dates do not shift across time zones", () => {
  setFormatConfig("en-GB", "America/Los_Angeles");
  assert.equal(formatDate("2026-10-19", { dateStyle: "short" }), "19/10/2026");
  setFormatConfig("en-GB", "Pacific/Kiritimati");
  assert.equal(formatDate("2026-10-19", { dateStyle: "short" }), "19/10/2026");
});
test("notification edits never send server-owned identity or timestamp columns", () => {
  assert.deepEqual(notificationPreferenceInput({ memberId: "server-owned", updatedAt: "server-time",
    quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "08:00", quietHoursTimezone: "Europe/London" }),
    { quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "08:00", quietHoursTimezone: "Europe/London" });
});
test("draft recovery never substitutes another circle/group or the Home audience context", () => {
  assert.equal(canRestoreDraftHere({}, {}), true);
  assert.equal(canRestoreDraftHere({ circleId: "one" }, { circleId: "one" }), true);
  assert.equal(canRestoreDraftHere({ groupId: "one" }, { groupId: "one" }), true);
  assert.equal(canRestoreDraftHere({ circleId: "two" }, { circleId: "one" }), false);
  assert.equal(canRestoreDraftHere({}, { groupId: "one" }), false);
  assert.equal(canRestoreDraftHere({ groupId: "one" }, {}), false);
});
test("offline drafts store only account-scoped ciphertext and decrypt in the current session", async () => {
  assert.equal(await store.saveEncrypted("account-a", draft), true);
  const raw = localStorage.getItem("me:draft-ct:account-a")!;
  assert.ok(raw); assert.ok(!raw.includes("Private unsent")); assert.ok(!raw.includes("audience"));
  assert.deepEqual(await store.loadEncrypted("account-a"), draft);
  store.setActiveUser("account-b");
  assert.equal(await store.loadEncrypted("account-a"), null);
  assert.equal(await store.loadEncrypted("account-b"), null);
});
test("logout/deletion erases memory, ciphertext and key, and rejects late writes", async () => {
  store.setMemoryDraft("account-a", draft); await store.saveEncrypted("account-a", draft);
  store.endAccountSession("account-a");
  assert.equal(store.getMemoryDraft("account-a"), null);
  assert.equal(localStorage.getItem("me:draft-ct:account-a"), null);
  assert.equal(sessionStorage.getItem("me:draft-key:account-a"), null);
  assert.equal(await store.saveEncrypted("account-a", draft), false);
});
test("a wipe racing asynchronous key generation cannot resurrect a session key or ciphertext", async () => {
  const pending = store.saveEncrypted("account-a", draft);
  store.endAccountSession("account-a");
  assert.equal(await pending, false);
  assert.equal(sessionStorage.getItem("me:draft-key:account-a"), null);
  assert.equal(localStorage.getItem("me:draft-ct:account-a"), null);
});
test("account switch prevents the previous account writing plaintext into the new tab state", () => {
  store.setMemoryDraft("account-a", draft);
  store.wipeDrafts("account-a"); store.setActiveUser("account-b");
  store.setMemoryDraft("account-a", draft);
  assert.equal(store.getMemoryDraft("account-a"), null);
  assert.equal(store.getMemoryDraft("account-b"), null);
});
test("storage-event cleanup works without BroadcastChannel and drops plaintext previews", async () => {
  const unsubscribe = store.listenForCleanup();
  store.setMemoryDraft("account-a", draft); await store.saveEncrypted("account-a", draft);
  const event = new Event("storage");
  Object.assign(event, { key: "me:draft-wipe-signal", newValue: JSON.stringify({ type: "wipe", userId: "account-a" }) });
  window.dispatchEvent(event);
  assert.equal(store.getMemoryDraft("account-a"), null);
  assert.equal(sessionStorage.getItem("me:draft-key:account-a"), null);
  unsubscribe();
});
