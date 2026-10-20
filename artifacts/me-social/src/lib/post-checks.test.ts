import { test } from "node:test";
import assert from "node:assert/strict";
import { externalPostLinks } from "./external-post-links";
import { postOperationError } from "./post-errors";

test("news and social links become safe plain external links without losing text", () => {
  const text = "News: https://www.abc.net.au/news/test. Also https://social.example.org/posts/42?q=news!";
  const parts = externalPostLinks(text);
  assert.equal(parts.map(p => p.text).join(""), text);
  assert.deepEqual(parts.filter(p => p.href).map(p => p.domain), ["www.abc.net.au", "social.example.org"]);
});
test("markup, script and credential-bearing URLs never become active embeds or links", () => {
  const text = '<script>alert(1)</script> javascript:alert(2) https://user:password@site.org/';
  assert.equal(externalPostLinks(text).filter(p => p.href).length, 0);
  assert.equal(externalPostLinks(text).map(p => p.text).join(""), text);
});
test("link rendering is bounded and preserves remaining content", () => {
  const text = Array.from({ length: 30 }, (_, i) => `https://news.example.org/${i}`).join(" ");
  const parts = externalPostLinks(text);
  assert.equal(parts.filter(p => p.href).length, 20);
  assert.equal(parts.map(p => p.text).join(""), text);
});
test("auth failures explain sign-in instead of pretending a post was saved", () => {
  assert.match(postOperationError({ status: 401 }, "Failed."), /sign in again/);
});
test("safety holds are explained and private server failures are not exposed", () => {
  assert.match(postOperationError({ status: 503, data: { error: "Uploads paused" } }, "Failed."), /Uploads paused/);
  assert.doesNotMatch(postOperationError({ status: 500, data: { error: "private database diagnostic" } }, "Failed."), /database/);
  assert.match(postOperationError(new Error("network"), "Failed."), /not been cleared/);
});
