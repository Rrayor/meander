#!/usr/bin/env node
// Generate the AI usage report assets from a data.json file.
// Usage: node generate.mjs <data.json> --out <dir>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  averageScore,
  renderBadge,
  renderGauge,
  sanitizeStages,
} from "./render.js";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  const value = i === -1 ? undefined : args[i + 1];
  return value !== undefined && !value.startsWith("--") ? value : fallback;
};

const dataFile = args.find(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
const outDir = flag("--out", null);

if (!dataFile || !outDir) {
  console.error("usage: node generate.mjs <data.json> --out <dir>");
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
};
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(outDir, name), content);
}
console.log(`wrote ${Object.keys(files).length} files to ${outDir}`);
