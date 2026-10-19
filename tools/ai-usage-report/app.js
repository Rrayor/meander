// Browser editor for the AI usage transparency report.
// Wires DOM controls to the pure renderers in render.js.

import {
  averageScore,
  renderBadge,
  renderGauge,
  renderReadmeSnippet,
  sanitizeStages,
} from "./render.js";
import { zipSync } from "./zip.js";

const SCORE_RANGE = [0, 1, 2, 3, 4, 5];
const NOT_RATED_LABEL = "not rated";

let stages = [
  "Specification",
  "Architecture Design",
  "UI design",
  "Implementation",
  "Review",
  "Testing",
  "Documentation",
].map((name) => ({ name, score: null, explanation: "" }));

window.__aiUsageReady = true;
// A slow module load may have already shown the warning — hide it now.
document.getElementById("module-warning").hidden = true;

const stagesEl = document.getElementById("stages");
const assetPathEl = document.getElementById("asset-path");

const uid = (() => {
  let n = 0;
  return () => `s${++n}`;
})();

const download = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const refresh = () => {
  const avg = averageScore(stages);
  document.getElementById("preview-light").innerHTML = renderGauge(
    stages,
    "light",
  );
  document.getElementById("preview-dark").innerHTML = renderGauge(
    stages,
    "dark",
  );
  document.getElementById("badge-light").innerHTML = renderBadge(avg, "light");
  document.getElementById("badge-dark").innerHTML = renderBadge(avg, "dark");
};

const renderStages = () => {
  stagesEl.replaceChildren();
  stages.forEach((stage, i) => {
    const id = uid();
    const label = () => stage.name.trim() || `stage ${i + 1}`;
    const row = document.createElement("div");
    row.className = "stage";

    const moves = document.createElement("div");
    moves.className = "moves";
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.disabled = i === 0;
    up.addEventListener("click", () => {
      [stages[i - 1], stages[i]] = [stages[i], stages[i - 1]];
      renderStages();
      refresh();
    });
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.disabled = i === stages.length - 1;
    down.addEventListener("click", () => {
      [stages[i], stages[i + 1]] = [stages[i + 1], stages[i]];
      renderStages();
      refresh();
    });
    moves.append(up, down);

    const fields = document.createElement("div");
    fields.className = "fields";

    const name = document.createElement("input");
    name.type = "text";
    name.value = stage.name;
    name.setAttribute("aria-label", "Stage name");
    name.placeholder = `Stage ${i + 1}`;

    const scoreField = document.createElement("fieldset");
    scoreField.style.border = "none";
    scoreField.style.padding = "0";
    scoreField.style.margin = "0";
    const legend = document.createElement("legend");
    legend.className = "visually-hidden";
    scoreField.append(legend);
    const scoreWrap = document.createElement("div");
    scoreWrap.className = "scores";
    for (const value of [...SCORE_RANGE, null]) {
      const option = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `score-${id}`;
      input.checked = stage.score === value;
      input.addEventListener("change", () => {
        stage.score = value;
        refresh();
      });
      const span = document.createElement("span");
      span.textContent = value === null ? NOT_RATED_LABEL : String(value);
      option.append(input, span);
      scoreWrap.append(option);
    }
    scoreField.append(scoreWrap);

    const explanation = document.createElement("input");
    explanation.type = "text";
    explanation.value = stage.explanation;
    explanation.placeholder = "Optional explanation";
    explanation.addEventListener("input", () => {
      stage.explanation = explanation.value;
    });

    fields.append(name, scoreField, explanation);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      stages.splice(i, 1);
      renderStages();
      refresh();
    });

    const syncNames = () => {
      legend.textContent = `Score for ${label()}`;
      explanation.setAttribute("aria-label", `Explanation for ${label()}`);
      del.setAttribute("aria-label", `Delete ${label()}`);
      up.setAttribute("aria-label", `Move ${label()} up`);
      down.setAttribute("aria-label", `Move ${label()} down`);
    };
    syncNames();
    name.addEventListener("input", () => {
      stage.name = name.value;
      syncNames();
      refresh();
    });

    row.append(moves, fields, del);
    stagesEl.append(row);
  });
};

document.getElementById("add").addEventListener("click", () => {
  stages.push({ name: "", score: null, explanation: "" });
  renderStages();
  refresh();
});

document.getElementById("load").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  const errorEl = document.getElementById("load-error");
  reader.addEventListener("load", () => {
    try {
      const raw = JSON.parse(reader.result);
      if (!Array.isArray(raw)) throw new Error("not a stage list");
      stages = sanitizeStages(raw);
      errorEl.hidden = true;
      renderStages();
      refresh();
    } catch {
      errorEl.textContent = "Could not read stages from that file.";
      errorEl.hidden = false;
    }
  });
  reader.readAsText(file);
  event.target.value = "";
});

document.getElementById("download-json").addEventListener("click", () => {
  download(
    "data.json",
    new Blob([JSON.stringify(sanitizeStages(stages), null, 2) + "\n"], {
      type: "application/json",
    }),
  );
});

document.getElementById("export-zip").addEventListener("click", () => {
  const clean = sanitizeStages(stages);
  const avg = averageScore(clean);
  const enc = new globalThis.TextEncoder();
  const files = [
    { name: "ai-usage.svg", text: renderGauge(clean, "light") },
    { name: "ai-usage-dark.svg", text: renderGauge(clean, "dark") },
    { name: "ai-usage-avg.svg", text: renderBadge(avg, "light") },
    { name: "ai-usage-avg-dark.svg", text: renderBadge(avg, "dark") },
    { name: "data.json", text: JSON.stringify(clean, null, 2) + "\n" },
    {
      name: "README-snippet.md",
      text: renderReadmeSnippet(clean, avg, assetPathEl.value),
    },
  ].map(({ name, text }) => ({ name, data: enc.encode(text) }));
  download(
    "ai-usage.zip",
    new Blob([zipSync(files)], { type: "application/zip" }),
  );
});

assetPathEl.addEventListener("input", refresh);

renderStages();
refresh();
