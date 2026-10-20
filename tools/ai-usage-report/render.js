// Pure SVG renderers for the AI usage transparency report.
// Shared by the browser editor (app.js) and the node generator (generate.mjs).

export const THEMES = {
  light: {
    text: "#334155",
    score: "#0f172a",
    empty: "#eef1f6",
    divider: "#fff",
    chipBg: "#fff",
    chipBorder: "#e2e8f0",
    muted: "#64748b",
    unratedStroke: "#94a3b8",
  },
  dark: {
    text: "#c9d1d9",
    score: "#f0f6fc",
    empty: "#21262d",
    divider: "rgba(13,17,23,0.7)",
    chipBg: "#161b22",
    chipBorder: "#30363d",
    muted: "#8b949e",
    unratedStroke: "#30363d",
  },
};

export const GRADIENT_STOPS = [
  { offset: 0, color: "#00e5ff" },
  { offset: 0.5, color: "#7c4dff" },
  { offset: 1, color: "#ff2d96" },
];

export const FONT_STACK =
  "ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif";

const BAR_X = 130;
const BAR_W = 300;
const BAR_H = 18;
const CELLS = 5;
const CELL_W = BAR_W / CELLS;
const ROW_H = 30;
const LABEL_MAX = 18;
const UNRATED_LABEL = "not yet rated";
export const OVERALL_LABEL = "Overall";

const XML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

// XML 1.0 forbids C0 control characters other than tab, LF, CR.
// eslint-disable-next-line no-control-regex -- intentionally matching control characters
const XML_FORBIDDEN = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

export function escapeXml(s) {
  return String(s)
    .replace(XML_FORBIDDEN, "")
    .replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

// For markdown bodies (the <details> block): XML escaping first, then
// backslash-escape characters that would form markdown syntax.
const escapeMarkdown = (s) =>
  escapeXml(s).replace(/[\\`*_[\]]/g, (c) => `\\${c}`);

const truncate = (s) => {
  const chars = [...s];
  return chars.length > LABEL_MAX
    ? `${chars.slice(0, LABEL_MAX - 1).join("")}…`
    : s;
};

const gradientDef = (id) =>
  `<linearGradient id="${id}" x1="0" x2="1">${GRADIENT_STOPS.map(
    (s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`,
  ).join("")}</linearGradient>`;

const dividers = (t) =>
  `<g stroke="${t.divider}" stroke-width="2">${[1, 2, 3, 4]
    .map(
      (i) =>
        `<line x1="${i * CELL_W}" y1="0" x2="${i * CELL_W}" y2="${BAR_H}"/>`,
    )
    .join("")}</g>`;

const gaugeRow = (stage, y, t, gradId, clipId) => {
  const label = escapeXml(truncate(stage.name));
  if (stage.score === null) {
    return (
      `<g transform="translate(0,${y})">` +
      `<text x="0" y="13" fill="${t.muted}">${label}</text>` +
      `<g transform="translate(${BAR_X},0)">` +
      `<rect width="${BAR_W}" height="${BAR_H}" rx="9" fill="none" stroke="${t.unratedStroke}" stroke-dasharray="5 4"/>` +
      `<text x="${BAR_W / 2}" y="13" font-size="10" fill="${t.muted}" text-anchor="middle">${UNRATED_LABEL}</text>` +
      `</g><text x="445" y="13" fill="${t.muted}">—</text></g>`
    );
  }
  const filled = stage.score * CELL_W;
  const mask =
    filled < BAR_W
      ? `<rect x="${filled}" width="${BAR_W - filled}" height="${BAR_H}" fill="${t.empty}"/>`
      : "";
  return (
    `<g transform="translate(0,${y})">` +
    `<text x="0" y="13" fill="${t.text}">${label}</text>` +
    `<g transform="translate(${BAR_X},0)" clip-path="url(#${clipId})">` +
    `<rect width="${BAR_W}" height="${BAR_H}" fill="url(#${gradId})"/>${mask}${dividers(t)}` +
    `</g><rect x="${BAR_X}" y="0" width="${BAR_W}" height="${BAR_H}" rx="9" fill="none" stroke="${t.unratedStroke}"/>` +
    `<text x="445" y="13" font-weight="650" fill="${t.score}">${stage.score}</text></g>`
  );
};

export function renderGauge(stages, theme) {
  const t = THEMES[theme];
  const gradId = `g-${theme}`;
  const clipId = `c-${theme}`;
  const height = stages.length * ROW_H + 16;
  const rows = stages
    .map((s, i) => gaugeRow(s, 16 + i * ROW_H, t, gradId, clipId))
    .join("");
  return (
    `<svg width="520" height="${height}" xmlns="http://www.w3.org/2000/svg" ` +
    `font-family="${FONT_STACK}" font-size="12">` +
    `<defs>${gradientDef(gradId)}` +
    `<clipPath id="${clipId}"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="9"/></clipPath>` +
    `</defs>${rows}</svg>`
  );
}

const LEGEND_LINE = "0 = no AI at all · 5 = only vibes";
const DETAILS_SUMMARY = "Per-stage explanations";

export function sanitizeStages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e !== null && typeof e === "object" && !Array.isArray(e))
    .map((e, i) => ({
      name:
        typeof e.name === "string" && e.name.trim() !== ""
          ? e.name.trim()
          : `Stage ${i + 1}`,
      score:
        typeof e.score === "number" && Number.isInteger(e.score)
          ? Math.min(CELLS, Math.max(0, e.score))
          : null,
      explanation:
        typeof e.explanation === "string" ? e.explanation.trim() : "",
    }));
}

const pictureBlock = (base, dark, light, alt, width) =>
  `<picture>\n` +
  `  <source srcset="${base}/${dark}" media="(prefers-color-scheme: dark)">\n` +
  `  <img src="${base}/${light}" alt="${alt}" width="${width}">\n` +
  `</picture>`;

const formatAverage = (avg) => (avg === null ? "—" : avg.toFixed(1));

export function renderReadmeSnippet(stages, avg, assetPath) {
  const base = escapeXml(String(assetPath).replace(/\/$/, ""));
  const parts = [
    pictureBlock(
      base,
      "ai-usage-avg-dark.svg",
      "ai-usage-avg.svg",
      `Average AI usage score: ${formatAverage(avg)} / 5`,
      240,
    ),
    "",
    pictureBlock(
      base,
      "ai-usage-dark.svg",
      "ai-usage.svg",
      "AI usage transparency: per-stage gauge from 0 (no AI) to 5 (only vibes)",
      520,
    ),
    "",
    `_${LEGEND_LINE}_`,
  ];
  const explained = stages.filter((s) => s.explanation !== "");
  if (explained.length > 0) {
    const items = explained
      .map((s) => {
        const score = s.score === null ? "not yet rated" : s.score;
        return `- **${escapeMarkdown(s.name)} (${score})** — ${escapeMarkdown(s.explanation)}`;
      })
      .join("\n");
    parts.push(
      "",
      `<details>\n<summary>${DETAILS_SUMMARY}</summary>\n\n${items}\n</details>`,
    );
  }
  return parts.join("\n") + "\n\n";
}

const BADGE_W = 240;
const BADGE_H = 30;
const MINI_BAR_X = 62;
const MINI_BAR_W = 104;
const MINI_BAR_H = 14;
const MINI_CELL_W = MINI_BAR_W / CELLS;

export function averageScore(stages) {
  const rated = stages.map((s) => s.score).filter((s) => s !== null);
  if (rated.length === 0) return null;
  return (
    Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10
  );
}

export function renderBadge(avg, theme) {
  const t = THEMES[theme];
  const gradId = `bg-${theme}`;
  const clipId = `bc-${theme}`;
  const fill = avg === null ? 0 : (avg / CELLS) * MINI_BAR_W;
  const bar =
    avg === null
      ? `<rect width="${MINI_BAR_W}" height="${MINI_BAR_H}" fill="${t.empty}"/>`
      : `<rect width="${MINI_BAR_W}" height="${MINI_BAR_H}" fill="url(#${gradId})"/>` +
        `<rect x="${fill}" width="${MINI_BAR_W - fill}" height="${MINI_BAR_H}" fill="${t.empty}"/>`;
  const dividers = `<g stroke="${t.divider}" stroke-width="1.5">${[1, 2, 3, 4]
    .map(
      (i) =>
        `<line x1="${i * MINI_CELL_W}" y1="0" x2="${i * MINI_CELL_W}" y2="${MINI_BAR_H}"/>`,
    )
    .join("")}</g>`;
  const value = `${formatAverage(avg)} / 5`;
  return (
    `<svg width="${BADGE_W}" height="${BADGE_H}" xmlns="http://www.w3.org/2000/svg" ` +
    `font-family="${FONT_STACK}">` +
    `<defs>${gradientDef(gradId)}` +
    `<clipPath id="${clipId}"><rect x="0" y="0" width="${MINI_BAR_W}" height="${MINI_BAR_H}" rx="7"/></clipPath>` +
    `</defs>` +
    `<rect width="${BADGE_W}" height="${BADGE_H}" rx="8" fill="${t.chipBg}" stroke="${t.chipBorder}"/>` +
    `<text x="12" y="20" font-size="11" font-weight="650" fill="${t.muted}">${OVERALL_LABEL}</text>` +
    `<g transform="translate(${MINI_BAR_X},8)" clip-path="url(#${clipId})">${bar}${dividers}</g>` +
    `<text x="176" y="20" font-size="11" font-weight="700" fill="${t.score}">${value}</text>` +
    `</svg>`
  );
}
