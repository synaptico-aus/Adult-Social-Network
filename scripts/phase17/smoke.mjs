import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

// No arbitrary target, authentication, mutation or production load is supported.
const base = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:80";
const root = fileURLToPath(new URL("../../", import.meta.url));
const samples = [];
async function request(path, expected) {
  const begin = performance.now();
  try {
    const r = await fetch(`${base}/api${path}`, { signal: AbortSignal.timeout(5000), redirect: "error" });
    let bytes = 0;
    for await (const chunk of r.body ?? []) {
      bytes += chunk.byteLength;
      if (bytes > 131072) throw new Error("Response size cap exceeded");
    }
    return { path, status: r.status, expected, ok: expected.includes(r.status), ms: Math.round(performance.now() - begin), bytes };
  } catch { return { path, status: null, expected, ok: false, ms: Math.round(performance.now() - begin), bytes: 0 }; }
}
for (const path of ["/healthz", "/experience/catalogue"]) {
  for (let batch = 0; batch < 10; batch++) samples.push(...await Promise.all(Array.from({ length: 4 }, () => request(path, [200]))));
}
for (const path of ["/feed", "/staff/ops", "/media/phase17-nonexistent", "/profile/export"]) samples.push(await request(path, [401, 403]));
const sorted = samples.map(x => x.ms).sort((a, b) => a - b);
const result = {
  scope: "Development-only public-route smoke, 4 concurrent requests, 80 public reads and 4 unauthenticated denials. NOT representative authenticated/media capacity, unreliable-network, native or production evidence.",
  observedAt: new Date().toISOString(), requests: samples.length, failures: samples.filter(x => !x.ok).length,
  p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1],
  samples,
};
const out = resolve(root, "generated-artifacts/phase17");
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "development-smoke.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ ...result, samples: undefined }, null, 2));
process.exitCode = result.failures ? 1 : 0;
