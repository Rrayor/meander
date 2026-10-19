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
    muted: "#94a3b8",
    unratedStroke: "#cbd5e1",
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

const XML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

export function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

const truncate = (s) =>
  s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1)}…` : s;

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
