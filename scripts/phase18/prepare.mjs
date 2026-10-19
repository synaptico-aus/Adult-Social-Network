import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assessStore } from "./policy.mjs";
import { assessRelease } from "../phase17/policy.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const out = path.join(root, "generated-artifacts/phase18");
const read = relative => readFile(path.join(root, relative), "utf8");
const json = async relative => JSON.parse(await read(relative));
const escape = s => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const config = await json("docs/store/phase18.json");
const phase17 = assessRelease(await json("docs/release/phase17-evidence.json"), await json("docs/release/phase17-targets.json"));
const result = assessStore(config, phase17);
const inventory = [];
for (const dir of ["artifacts/me-social", "artifacts/api-server"]) {
  const pkg = await json(`${dir}/package.json`);
  for (const [scope, dependencies] of Object.entries({ dependencies: pkg.dependencies, devDependencies: pkg.devDependencies })) {
    for (const [name, requested] of Object.entries(dependencies ?? {})) {
      let installedVersion = null;
      try { installedVersion = (await json(`${dir}/node_modules/${name}/package.json`)).version; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      inventory.push({ artifact: dir, name, scope, requested, installedVersion });
    }
  }
}
inventory.sort((a, b) => `${a.artifact}/${a.name}`.localeCompare(`${b.artifact}/${b.name}`));
const inventoryDigest = createHash("sha256").update(JSON.stringify(inventory)).digest("hex");
// File presence is recorded separately and NEVER treated as verified signing.
const filePresence = {};
for (const key of ["iosProject", "androidProject", "iosSignedArtifact", "androidSignedArtifact"]) {
  const relative = config.native[key];
  if (!relative) { filePresence[key] = "not provided"; continue; }
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error(`Build references must stay inside workspace: ${key}`);
  try { await access(target); filePresence[key] = "exists; signature/runtime NOT verified"; }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    filePresence[key] = "missing";
    result.blockers.push(`${key}: referenced file is absent`);
    result.recommendation = "NOT READY FOR SUBMISSION";
  }
}
const documents = await Promise.all([
  "official-requirements.md", "data-disclosures.md", "policy-drafts.md", "release-runbook.md", "desktop-check.md",
].map(async name => ({ name, content: await read(`docs/store/${name}`) })));
await mkdir(out, { recursive: true });
const publicSummary = {
  ...result, phase17Recommendation: phase17.recommendation, phase17Blockers: phase17.blockers,
  inventoryDigest, filePresence, evidence: config.evidence,
};
await writeFile(path.join(out, "readiness.json"), JSON.stringify(publicSummary, null, 2) + "\n");
await writeFile(path.join(out, "sdk-inventory.json"), JSON.stringify({
  scannedAt: new Date().toISOString(), scope: "Installed direct WEB/SERVER packages, NOT a native binary SBOM",
  digest: inventoryDigest, packages: inventory,
}, null, 2) + "\n");
let previews = "";
for (const [name, title] of [
  ["me-ios-icon-1024.png", "Apple icon candidate — not integrated"],
  ["me-play-icon-512.png", "Play icon candidate — not integrated"],
  ["me-crimson-splash-2048.png", "Crimson splash artwork — not a runtime screenshot"],
]) {
  try {
    const data = await readFile(path.join(out, "assets", name));
    previews += `<figure><img alt="${escape(title)}" src="data:image/png;base64,${data.toString("base64")}"><figcaption>${escape(title)}</figcaption></figure>`;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}
let desktopReference = "";
try {
  const data = await readFile(path.join(out, "desktop-sign-in-reference.jpg"));
  desktopReference = `<h2>Actual desktop web reference — NOT a native/store screenshot</h2><img style="width:100%;height:auto;max-width:960px" alt="Actual desktop development sign-in showing email and Google sign-in" src="data:image/jpeg;base64,${data.toString("base64")}">`;
} catch (error) { if (error.code !== "ENOENT") throw error; }
const sections = documents.map(d => `<section><h2>${escape(d.name)}</h2><pre>${escape(d.content)}</pre></section>`).join("");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Me — Phase 18 submission preparation</title><style>
body{font:16px/1.6 system-ui,sans-serif;margin:auto;padding:28px;max-width:1080px;color:#241331;background:#fff}
h1,h2{color:#652494} .status{background:#fff0f2;border:2px solid #b01030;padding:20px;border-radius:12px}
section{margin:32px 0;border-top:1px solid #d8c8e8}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
li{margin:8px 0}.assets{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0;width:210px}
img{width:210px;height:210px;object-fit:contain}figcaption{font-size:14px}code{overflow-wrap:anywhere}
</style><h1>Me — Phase 18 submission preparation</h1><div class="status"><strong>${escape(result.recommendation)}</strong>
<p>No signing, TestFlight/Play upload, submission, production publication or release has occurred.
Native projects and an approved review backend do not exist. Phase 17: ${escape(phase17.recommendation)}.
Prepared ${escape(result.assessedAt)}. Owner approval is required for any future submission and release.</p></div>
<h2>Candidate assets</h2><div class="assets">${previews || "<p>Run the store:assets command to generate asset candidates.</p>"}</div>
${desktopReference}<h2>Blocking dependencies (${result.blockers.length})</h2><ul>${result.blockers.map(b => `<li>${escape(b)}</li>`).join("")}</ul>
<h2>Owned evidence register</h2>${config.evidence.map(e => `<p><strong>${escape(e.id)} — ${escape(e.status)}</strong><br>Owner role: ${escape(e.owner)}<br>${escape(e.reference)}</p>`).join("")}
<h2>Draft listing</h2><pre>${escape(JSON.stringify(config.listing, null, 2))}</pre>
<h2>Installed-package inventory</h2><p>Direct web/server packages only; not a native SDK/privacy audit. Inventory SHA-256:
<code>${inventoryDigest}</code>. See generated sdk-inventory.json for every installed version.</p>
<pre>${escape(inventory.filter(p => /clerk|google-cloud|pino|express|react$/.test(p.name)).map(p => `${p.artifact}: ${p.name} ${p.installedVersion ?? "NOT RESOLVED"} (${p.scope})`).join("\n"))}</pre>
${sections}<h2>Next action</h2><p>Resolve native-client and account/region/policy dependencies with the owner.
Keep safety holds. Re-run both release checks with real, current evidence before an owner submission decision.</p></html>`;
await writeFile(path.join(out, "submission-readiness.html"), html);
console.log(`${result.recommendation}: ${result.blockers.length} Phase 18 blockers; Phase 17 ${phase17.recommendation}`);
console.log(`Prepared report and installed-package inventory in ${out}. No submission attempted.`);
process.exitCode = result.blockers.length ? 1 : 0;
