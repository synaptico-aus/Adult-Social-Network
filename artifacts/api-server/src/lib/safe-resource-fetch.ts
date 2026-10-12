import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";

const MAX_BYTES = 256 * 1024;
const MAX_TIME = 8000;
const MAX_REDIRECTS = 3;

/** Conservative global-unicast policy: reject all special-purpose ranges. */
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const [first, second] = address.split(":").slice(0, 2).map((n) => parseInt(n || "0", 16));
    // Excludes loopback, ULA, link-local, mapped/translated IPv4, multicast,
    // Teredo/ORCHID/benchmark/documentation and 6to4 transition ranges.
    return first >= 0x2000 && first <= 0x3fff &&
      !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) &&
      first !== 0x2002 && first !== 0x3fff;
  }
  return false;
}

export function resourceUrl(raw: string): URL {
  if (raw.length > 2048 || /[\u0000-\u0020\\]/.test(raw)) throw new Error("Invalid URL");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Only credential-free HTTPS links on port 443 are permitted");
  }
  const host = url.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test|example|onion)$/.test(host) ||
      host.endsWith(".") || host.includes("%")) throw new Error("Destination is not a public hostname");
  url.hash = "";
  return url;
}

type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
export async function resolvePublic(host: string, resolver: Resolver = (name) => lookup(name, { all: true, verbatim: true })) {
  const addresses = await resolver(host);
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address))) {
    throw new Error("DNS contains a non-public address");
  }
  return addresses;
}

function bounded<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("External request timed out")), Math.max(1, milliseconds));
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// The request connects ONLY to a previously validated address. No second DNS
// lookup, proxy environment, shared connection pool, cookies, or authentication.
async function hop(url: URL, deadline: number, metadata: boolean, addresses: { address: string; family: number }[]) {
  if (Date.now() >= deadline) throw new Error("External request timed out");
  const selected = addresses[0];
  return new Promise<{ status: number; location?: string; html: string }>((resolve, reject) => {
    const timer = setTimeout(() => req.destroy(new Error("External request timed out")), Math.max(1, deadline - Date.now()));
    const req = request(url, {
      agent: false,
      servername: url.hostname,
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [selected]);
        else callback(null, selected.address, selected.family);
      },
      headers: { Accept: "text/html", "Accept-Encoding": "identity", "User-Agent": "Me-LinkReview/1.0" },
      maxHeaderSize: 16 * 1024,
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        const location = res.headers.location;
        res.destroy();
        clearTimeout(timer);
        resolve({ status, location, html: "" });
        return;
      }
      if (!metadata) {
        res.destroy();
        clearTimeout(timer);
        resolve({ status, html: "" });
        return;
      }
      const contentType = res.headers["content-type"] ?? "";
      if (status < 200 || status >= 300 || !/^text\/html(?:;|$)/i.test(contentType) ||
          (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") ||
          Number(res.headers["content-length"] ?? 0) > MAX_BYTES) {
        clearTimeout(timer);
        res.destroy();
        reject(new Error("Preview requires a small, uncompressed HTML response"));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { req.destroy(new Error("Preview exceeds size limit")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => { clearTimeout(timer); resolve({ status, html: Buffer.concat(chunks).toString("utf8") }); });
      res.on("error", (error) => { clearTimeout(timer); reject(error); });
      res.on("aborted", () => { clearTimeout(timer); reject(new Error("Incomplete response")); });
    });
    req.on("error", (error) => { clearTimeout(timer); reject(error); });
    req.end();
  });
}

export async function safeResourceFetch(raw: string, metadata = true, dependencies?: {
  resolver?: Resolver;
  transport?: typeof hop;
}) {
  const deadline = Date.now() + MAX_TIME;
  let url = resourceUrl(raw);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const addresses = await bounded(resolvePublic(url.hostname, dependencies?.resolver), Math.min(1500, deadline - Date.now()));
    const response = await bounded((dependencies?.transport ?? hop)(url, deadline, metadata, addresses), deadline - Date.now());
    if (Buffer.byteLength(response.html) > MAX_BYTES) throw new Error("Preview exceeds size limit");
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || redirects === MAX_REDIRECTS) throw new Error("Invalid or excessive redirects");
      // Resolve relative redirects; repeat URL policy, DNS policy and pinning.
      url = resourceUrl(new URL(response.location, url).href);
      continue;
    }
    return { url: url.href, domain: url.hostname, status: response.status, redirected: redirects > 0, html: response.html };
  }
  throw new Error("Redirect limit exceeded");
}

export function plainMetadata(value: string, limit: number): string {
  return value.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:#(\d+)|#x([a-f\d]+)|([a-z]+));/gi, (_all, dec, hex, named) => {
      if (dec || hex) {
        const n = parseInt(dec ?? hex, dec ? 10 : 16);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
      }
      return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " } as Record<string, string>)[named.toLowerCase()] ?? "";
    }).replace(/<[^>]*>/g, "").replace(/[<>\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ").trim().slice(0, limit);
}

export function extractMetadata(html: string) {
  const meta: Record<string, string> = {};
  // Only read quoted inert metadata values; never render or execute markup.
  for (const tag of html.match(/<meta\b[^>]{0,4096}>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) attrs[match[1].toLowerCase()] = match[3];
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (attrs.content) meta[key] = attrs.content;
  }
  const date = meta["article:published_time"] ?? meta.date;
  const parsed = date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null;
  return {
    title: plainMetadata(meta["og:title"] ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 200),
    description: plainMetadata(meta.description ?? meta["og:description"] ?? "", 300),
    sourceDate: parsed,
  };
}

/** Fixed provider URL templates only: no fetched iframe markup or oEmbed HTML. */
export function authorisedEmbed(raw: string, authorised: boolean): string | null {
  if (!authorised) return null;
  const url = resourceUrl(raw);
  let id: string | null = null;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})$/)?.[1] ?? null;
  } else if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  if (url.hostname === "open.spotify.com") {
    const path = url.pathname.match(/^\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]{22})$/);
    if (path) return `https://open.spotify.com/embed/${path[1]}/${path[2]}`;
  }
  return null;
}
