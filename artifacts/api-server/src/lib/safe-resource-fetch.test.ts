import { test } from "node:test";
import assert from "node:assert/strict";
import { publicAddress, resourceUrl, resolvePublic, safeResourceFetch, plainMetadata, extractMetadata, authorisedEmbed } from "./safe-resource-fetch.ts";

test("SSRF rejects IPv4 special ranges, IPv6 special and mapped addresses", () => {
  for (const ip of ["0.0.0.0", "10.0.0.2", "127.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1",
    "100.64.0.1", "192.0.2.2", "198.18.0.1", "198.51.100.2", "203.0.113.2", "224.0.0.1", "255.255.255.255",
    "::1", "::", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "fc00::1", "fe80::1", "ff02::1", "64:ff9b::808:808",
    "2001:db8::1", "2001:0db8:0000::1", "2001:0000::1", "2002:0808:0808::1", "3fff::1"]) {
    assert.equal(publicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888", "2606:4700:4700::1111"]) assert.equal(publicAddress(ip), true, ip);
});
test("URL restrictions reject literals, alternate encodings, internal names, credentials and protocols", () => {
  for (const url of ["http://example.org", "file:///etc/passwd", "ftp://example.org", "javascript:alert(1)",
    "https://user:pass@example.org", "https://example.org:444", "https://localhost", "https://a.local",
    "https://a.internal", "https://example.org.", "https://127.0.0.1", "https://2130706433",
    "https://0x7f000001", "https://0177.0.0.1", "https://[::1]", "https://example.org\\@localhost", "https://example.org/\r\nX:x"]) {
    assert.throws(() => resourceUrl(url), url);
  }
  assert.equal(resourceUrl("https://example.org/path#fragment").href, "https://example.org/path");
});
test("DNS rejects mixed public/private answers and every redirect is revalidated and pinned", async () => {
  await assert.rejects(resolvePublic("example.org", async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]));
  const hosts: string[] = [];
  const connected: string[] = [];
  const result = await safeResourceFetch("https://source.example.org/start", true, {
    resolver: async (host) => { hosts.push(host); return [{ address: host.startsWith("source.") ? "8.8.8.8" : "1.1.1.1", family: 4 }]; },
    transport: async (url, _deadline, _metadata, addresses) => {
      connected.push(addresses[0].address);
      return url.hostname.startsWith("source.") ? { status: 302, location: "https://destination.example.org/end", html: "" } : { status: 200, html: "<title>Neutral title</title>" };
    },
  });
  assert.deepEqual(hosts, ["source.example.org", "destination.example.org"]);
  assert.deepEqual(connected, ["8.8.8.8", "1.1.1.1"]);
  assert.equal(result.redirected, true);
  let connections = 0;
  await assert.rejects(safeResourceFetch("https://source.example.org", true, {
    resolver: async (host) => [{ address: host.startsWith("source.") ? "8.8.8.8" : "169.254.169.254", family: 4 }],
    transport: async () => { connections++; return { status: 302, location: "https://metadata.example.org/secret", html: "" }; },
  }));
  assert.equal(connections, 1, "private redirect must not connect");
});
test("redirect loops, protocol downgrade, oversized responses and slow DNS fail closed", async () => {
  const resolver = async () => [{ address: "8.8.8.8", family: 4 }];
  for (const location of ["http://example.org", "https://127.0.0.1", "file:///etc/passwd"]) {
    await assert.rejects(safeResourceFetch("https://example.org", true, { resolver, transport: async () => ({ status: 302, location, html: "" }) }));
  }
  await assert.rejects(safeResourceFetch("https://example.org", true, { resolver, transport: async () => ({ status: 302, location: "/loop", html: "" }) }));
  await assert.rejects(safeResourceFetch("https://example.org", true, { resolver, transport: async () => ({ status: 200, html: "x".repeat(256 * 1024 + 1) }) }));
  const start = Date.now();
  await assert.rejects(safeResourceFetch("https://example.org", true, { resolver: () => new Promise(() => {}) }));
  assert.ok(Date.now() - start < 2500, "DNS deadline is bounded");
});
test("metadata stays limited inert text; embed providers use fixed templates", () => {
  const metadata = extractMetadata(`<title>&lt;img src=x onerror=alert(1)&gt;Safe &amp; useful</title>
    <meta property="og:description" content="&lt;script&gt;bad()&lt;/script&gt;Plain">
    <meta property="article:published_time" content="not-a-date"><script>fetch('http://localhost')</script>`);
  assert.equal(metadata.title.includes("<"), false);
  assert.equal(metadata.sourceDate, null);
  assert.ok(metadata.description.length <= 300);
  assert.equal(plainMetadata("x".repeat(900), 300).length, 300);
  assert.equal(authorisedEmbed("https://www.youtube.com/watch?v=Abcdef12345", false), null);
  assert.equal(authorisedEmbed("https://www.youtube.com/watch?v=Abcdef12345", true), "https://www.youtube-nocookie.com/embed/Abcdef12345");
  assert.equal(authorisedEmbed("https://youtube.com.evil.org/watch?v=Abcdef12345", true), null);
  assert.equal(authorisedEmbed("https://open.spotify.com/track/1234567890123456789012", true), "https://open.spotify.com/embed/track/1234567890123456789012");
  assert.equal(authorisedEmbed("https://example.org/custom-iframe", true), null);
});
