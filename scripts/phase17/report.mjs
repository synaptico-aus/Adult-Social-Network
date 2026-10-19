import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { assessRelease, requirements } from "./policy.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const load = async path => JSON.parse(await readFile(resolve(root, path), "utf8"));
const register = await load("docs/release/phase17-evidence.json");
const targets = await load("docs/release/phase17-targets.json");
const result = assessRelease(register, targets);
const escape = value => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const lines = [
  "# Me Phase 17 go/no-go assessment", "", `Generated: ${new Date().toISOString()}`,
  `Candidate: ${register.candidate}`, `**Recommendation: ${result.recommendation}**`, "",
  "This is an evidence register assessment, not production certification or automatic permission to publish.",
  "Role titles are accountable owner assignments still to be accepted, not claims that people have completed reviews.", "",
  "## Evidence", "", "| Requirement | Result | Method | Owner | Reference |",
  "|---|---|---|---|---|",
  ...requirements.map(id => {
    const item = register.evidence.find(x => x.id === id);
    return `| ${id} | ${item?.status ?? "missing"} | ${escape(item?.method)} | ${escape(item?.owner ?? "Release lead")} | ${escape(item?.reference)} |`;
  }),
  "", "## Measurable targets", "", "| Metric | Target | Observed | Samples |", "|---|---|---|---|",
  ...Object.entries(targets.metrics).map(([key, target]) => `| ${key} | ${target.direction} ${target.limit} ${target.unit} | ${register.measurements?.[key]?.value ?? "not measured"} | ${register.measurements?.[key]?.samples ?? 0} |`),
  "", "## Owned issues", "", "| Issue | Severity | Status | Owner | Next action |", "|---|---|---|---|---|",
  ...register.issues.map(x => `| ${x.id} | ${x.severity} | ${x.status} | ${escape(x.owner)} | ${escape(x.nextAction)} |`),
  "", "## Blockers", "", ...result.blockers.map(x => `- ${x}`), "",
  "## Decision process", "",
  "NO-GO for wider release while any required evidence is missing, a target fails, or critical/high issues remain unresolved.",
  "Even complete evidence requires a named independent reviewer and accountable release lead to make and record the final decision.",
  "Re-run on the actual release candidate after material code, dependency, provider, region, roster or permission changes.",
  "No production data was deleted, no backup was overwritten and no real participant consent was inferred.",
];
const out = resolve(root, "generated-artifacts/phase17");
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "go-no-go.md"), lines.join("\n") + "\n");
const htmlEscape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
await writeFile(resolve(out, "go-no-go.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Me Phase 17 release assessment</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;padding:32px;background:#fff;color:#19151c}main{max-width:1200px;margin:auto}h1{color:#522280}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;border:1px solid #d8c6e7;border-radius:12px;padding:24px}header p{color:#742020;font-weight:bold}a{color:#522280}</style><main><header><h1>Me Phase 17 release assessment</h1><p>${htmlEscape(result.recommendation)} — independent sign-off required</p></header><pre>${htmlEscape(lines.join("\n"))}</pre></main></html>`);
await writeFile(resolve(out, "assessment.json"), JSON.stringify(result, null, 2) + "\n");
console.log(`${result.recommendation}: ${result.blockers.length} blockers. Report: ${resolve(out, "go-no-go.md")}`);
process.exitCode = result.blockers.length ? 1 : 0;
