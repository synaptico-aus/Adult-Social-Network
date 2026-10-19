import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import path from "node:path";
import sharp from "sharp";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const source = path.join(root, "docs/store/assets");
const out = path.join(root, "generated-artifacts/phase18/assets");
await mkdir(out, { recursive: true });
for (const [name, width, output] of [
  ["me-icon.svg", 1024, "me-ios-icon-1024.png"],
  ["me-icon.svg", 512, "me-play-icon-512.png"],
  ["me-adaptive-foreground.svg", 1024, "me-adaptive-foreground-1024.png"],
  ["me-crimson-splash.svg", 2048, "me-crimson-splash-2048.png"],
]) {
  let image = sharp(await readFile(path.join(source, name))).resize(width, width);
  if (name !== "me-adaptive-foreground.svg") image = image.removeAlpha();
  await image.png().toFile(path.join(out, output));
  const metadata = await sharp(path.join(out, output)).metadata();
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, width);
  assert.equal(metadata.hasAlpha, name === "me-adaptive-foreground.svg");
  console.log(`${output}: ${metadata.width} x ${metadata.height}; alpha=${metadata.hasAlpha}`);
}
console.log(`Candidate native artwork (not integrated or signed): ${out}`);
