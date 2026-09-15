import { test } from "node:test";
import assert from "node:assert/strict";
import { 
  canCreateNewRevision, 
  canArchive, 
  canWithdraw, 
  isoToDateInput, 
  dateInputToIso 
} from "./education-helpers.js";
import { 
  getSearchEducationQueryKey, 
  getGetEducationQueryKey 
} from "@workspace/api-client-react";

test("canCreateNewRevision capabilities matrix", () => {
  // Finding 1 requirements
  assert.equal(canCreateNewRevision("draft", "rejected"), true, "Must allow New Revision for draft lessons with rejected revisions");
  assert.equal(canCreateNewRevision("draft", "draft"), false, "Must not allow New Revision for drafts that are still in draft");
  assert.equal(canCreateNewRevision("published", "published"), true, "Must allow New Revision for published");
  assert.equal(canCreateNewRevision("review_due", "published"), true, "Must allow New Revision for review_due");
  assert.equal(canCreateNewRevision("archived", "published"), true, "Must allow New Revision for archived");
});

test("publisher actions matrix", () => {
  // review_due publisher actions
  assert.equal(canArchive("review_due"), true, "review_due must offer Archive");
  assert.equal(canWithdraw("review_due"), true, "review_due must offer Withdraw");
  
  // published publisher actions
  assert.equal(canArchive("published"), true, "published must offer Archive");
  assert.equal(canWithdraw("published"), true, "published must offer Withdraw");
});

test("Date serialization and formatting", () => {
  // Finding 2 requirements
  assert.equal(isoToDateInput(null), "", "Null ISO string returns empty string");
  assert.equal(isoToDateInput(undefined), "", "Undefined ISO string returns empty string");
  assert.equal(isoToDateInput("2024-01-15T12:00:00Z"), "2024-01-15", "ISO converts to YYYY-MM-DD");
  
  assert.equal(dateInputToIso(""), null, "Empty string converts to null");
  assert.equal(dateInputToIso(undefined), null, "Undefined converts to null");
  
  const isoDate = dateInputToIso("2024-01-15");
  assert.ok(isoDate !== null);
  assert.ok(isoDate.startsWith("2024-01-15T"), "Valid date input converts to full ISO string");
});

test("Generated Query Keys Usage", () => {
  // Finding 3 requirement check
  const searchKey = getSearchEducationQueryKey();
  assert.ok(searchKey.length > 0);
  assert.equal(searchKey[0], "/api/education", "Search key base must be correct");

  const detailKey = getGetEducationQueryKey("my-slug");
  assert.equal(detailKey[0], "/api/education/my-slug", "Detail key must include slug");
});
