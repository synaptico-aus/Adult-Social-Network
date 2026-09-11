import test from "node:test";
import assert from "node:assert/strict";
import { defaultVisibility, visibleProfile, isSelfRoleAuthority, isOwnedProfilePhotoPath, cardPayloadIsTextOnly, isAssistedAccessInput } from "./profile-policy.ts";

const profile = { id: "p", memberId: "m", preferredName: "A", photoPath: null, biography: "private", language: null, broadRegion: null, interests: [], dementiaConnection: "private", roles: ["carer"], discoverable: false, visibility: defaultVisibility() } as any;
test("sensitive fields are private by default", () => assert.equal(defaultVisibility().dementiaConnection, "private"));
test("discoverability is explicit opt in", () => assert.equal(profile.discoverable, false));
test("view-as filters private fields", () => { const result = visibleProfile(profile, "member"); assert.equal("biography" in result, false); assert.equal(result.preferredName, "A"); });
test("owner receives saved visibility settings", () => assert.deepEqual(visibleProfile(profile, "owner").visibility, profile.visibility));
test("self-described roles never authorize", () => assert.equal(isSelfRoleAuthority("staff"), false));
test("profile photos stay bound to their owner", () => {
  assert.equal(isOwnedProfilePhotoPath("member-a", "/objects/profile-photos/member-a/photo-1"), true);
  assert.equal(isOwnedProfilePhotoPath("member-a", "/objects/profile-photos/member-b/photo-1"), false);
});
test("media cards are rejected", () => assert.equal(cardPayloadIsTextOnly({ text: "x", photo: "url" }), false));
test("text cards are accepted", () => assert.equal(cardPayloadIsTextOnly({ text: "x", kind: "music_i_love" }), true));
test("assisted access identity input is rejected", () => assert.equal(isAssistedAccessInput({ relativeId: "m" }), true));
test("ordinary card input is not assisted access", () => assert.equal(isAssistedAccessInput({ text: "x" }), false));