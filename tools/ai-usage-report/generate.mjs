#!/usr/bin/env node
// Generate the AI usage report assets from a data.json file.
// Usage: node generate.mjs <data.json> --out <dir> [--assets <path-prefix>]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  averageScore,
  renderBadge,
  renderGauge,
  renderReadmeSnippet,
  sanitizeStages,
} from "./render.js";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const dataFile = args[0];
const outDir = flag("--out", null);
const assets = flag("--assets", "docs/ai-usage");

if (!dataFile || !outDir) {
  console.error(
    "usage: node generate.mjs <data.json> --out <dir> [--assets <path-prefix>]",
  );
  process.exit(1);
}

const stages = sanitizeStages(JSON.parse(readFileSync(dataFile, "utf8")));
const avg = averageScore(stages);

mkdirSync(outDir, { recursive: true });
const files = {
  "ai-usage.svg": renderGauge(stages, "light"),
  "ai-usage-dark.svg": renderGauge(stages, "dark"),
  "ai-usage-avg.svg": renderBadge(avg, "light"),
  "ai-usage-avg-dark.svg": renderBadge(avg, "dark"),
  "README-snippet.md": renderReadmeSnippet(stages, avg, assets),
};
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(outDir, name), content);
}
console.log(`wrote ${Object.keys(files).length} files to ${outDir}`);
