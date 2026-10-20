import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  THEMES,
  averageScore,
  escapeXml,
  renderBadge,
  renderGauge,
  renderReadmeSnippet,
  sanitizeStages,
} from "./render.js";

const oneStage = [{ name: "Specification", score: 1 }];

describe("renderGauge", () => {
  it("renders a partial fill for a mid-range score", () => {
    const svg = renderGauge(oneStage, "light");
    assert.match(svg, /<linearGradient id="[^"]+"/);
    assert.match(svg, /fill="url\(#[^"]+\)"/);
    assert.match(svg, /x="60"[^>]*fill="#eef1f6"/);
    assert.match(svg, />1</);
    assert.match(svg, />Specification</);
  });

  it("renders a full bar without an empty mask for score 5", () => {
    const svg = renderGauge([{ name: "Implementation", score: 5 }], "light");
    assert.doesNotMatch(svg, /#eef1f6/);
  });

  it("renders a dashed unrated row for null score, without gradient fill", () => {
    const svg = renderGauge([{ name: "Documentation", score: null }], "light");
    assert.match(svg, /stroke-dasharray="5 4"/);
    assert.match(svg, /not yet rated/);
    assert.doesNotMatch(svg, /fill="url\(#/);
  });

  it("uses dark theme empty-cell color in dark mode", () => {
    const svg = renderGauge(oneStage, "dark");
    assert.match(svg, /#21262d/);
    assert.match(svg, /#c9d1d9/);
  });

  it("grows height with the number of stages", () => {
    const stages = Array.from({ length: 3 }, (_, i) => ({
      name: `S${i}`,
      score: i,
    }));
    const svg = renderGauge(stages, "light");
    assert.match(svg, /height="106"/); // 3*30 + 16
  });

  it("escapes XML-unsafe characters in stage names", () => {
    const svg = renderGauge([{ name: 'A <b> & "c"', score: 2 }], "light");
    assert.match(svg, /A &lt;b&gt; &amp; &quot;c&quot;/);
    assert.doesNotMatch(svg, /<b>/);
  });

  it("exposes theme colors from Global Constraints", () => {
    assert.equal(THEMES.light.text, "#334155");
    assert.equal(THEMES.dark.text, "#c9d1d9");
  });
});

describe("averageScore", () => {
  it("means rated stages to one decimal, ignoring unrated", () => {
    assert.equal(
      averageScore([{ score: 1 }, { score: 4 }, { score: null }]),
      2.5,
    );
  });

  it("returns null when nothing is rated", () => {
    assert.equal(averageScore([{ score: null }, { score: null }]), null);
  });
});

describe("renderBadge", () => {
  it("fills the mini bar to a fractional average", () => {
    const svg = renderBadge(3.5, "light");
    assert.match(svg, /x="72\.8"[^>]*fill="#eef1f6"/);
    assert.match(svg, />3\.5 \/ 5</);
    assert.match(svg, />Overall</);
  });

  it("renders an empty bar and em-dash when nothing is rated", () => {
    const svg = renderBadge(null, "light");
    assert.match(svg, />— \/ 5</);
    assert.doesNotMatch(svg, /fill="url\(#/);
  });

  it("formats an integral average to one decimal", () => {
    const svg = renderBadge(4, "light");
    assert.match(svg, />4\.0 \/ 5</);
  });
});

describe("sanitizeStages", () => {
  it("clamps scores, drops non-objects, and applies fallbacks", () => {
    const out = sanitizeStages([
      { name: " A ", score: 7 },
      { name: 5, score: "hi" },
      null,
      { name: "B", score: 3, explanation: "  note  " },
    ]);
    assert.deepEqual(out, [
      { name: "A", score: 5, explanation: "" },
      { name: "Stage 2", score: null, explanation: "" },
      { name: "B", score: 3, explanation: "note" },
    ]);
  });

  it("treats non-integer scores as unrated", () => {
    const out = sanitizeStages([{ name: "A", score: 2.6 }]);
    assert.equal(out[0].score, null);
  });
});

describe("renderReadmeSnippet", () => {
  const stages = [
    { name: "Spec", score: 1, explanation: "AI filled gaps" },
    { name: "Impl", score: 5, explanation: "" },
  ];

  it("joins the asset path to the svg filenames", () => {
    const md = renderReadmeSnippet(stages, 3.0, "docs/ai-usage/");
    assert.match(md, /srcset="docs\/ai-usage\/ai-usage-dark\.svg"/);
    assert.match(md, /src="docs\/ai-usage\/ai-usage\.svg"/);
    assert.match(md, /srcset="docs\/ai-usage\/ai-usage-avg-dark\.svg"/);
  });

  it("puts the average badge before the per-stage gauge", () => {
    const md = renderReadmeSnippet(stages, 3.0, "docs/ai-usage/");
    assert.ok(
      md.indexOf("ai-usage-avg.svg") < md.indexOf("ai-usage.svg"),
      "average badge should come first",
    );
  });

  it("includes the scale legend", () => {
    const md = renderReadmeSnippet(stages, 3.0, "x");
    assert.match(md, /0 = no AI at all/);
    assert.match(md, /5 = only vibes/);
  });

  it("lists only stages that have explanations", () => {
    const md = renderReadmeSnippet(stages, 3.0, "x");
    assert.match(md, /<details>/);
    assert.match(md, /\*\*Spec \(1\)\*\* — AI filled gaps/);
    assert.doesNotMatch(md, /\*\*Impl/);
  });

  it("omits the details block entirely when no stage explains", () => {
    const md = renderReadmeSnippet(
      [{ name: "A", score: 2, explanation: "" }],
      2,
      "x",
    );
    assert.doesNotMatch(md, /<details>/);
  });

  it("escapes markdown/html in stage names", () => {
    const md = renderReadmeSnippet(
      [{ name: "A <b>", score: 1, explanation: "x" }],
      1,
      "x",
    );
    assert.match(md, /A &lt;b&gt;/);
  });

  it("escapes the asset path inside html attributes", () => {
    const md = renderReadmeSnippet(stages, 3, 'a"b');
    assert.doesNotMatch(md, /a"b/);
    assert.match(md, /a&quot;b/);
  });

  it("escapes markdown metacharacters in names and explanations", () => {
    const md = renderReadmeSnippet(
      [{ name: "A **b**", score: 1, explanation: "see [x](y)" }],
      1,
      "x",
    );
    assert.match(md, /A \\\*\\\*b\\\*\\\*/);
    assert.match(md, /see \\\[x\\\]\(y\)/);
  });

  it("formats an integral average to one decimal in the alt text", () => {
    const md = renderReadmeSnippet(stages, 4, "x");
    assert.match(md, /Average AI usage score: 4\.0 \/ 5/);
  });
});

describe("generate.mjs", () => {
  it("writes all five artifacts honoring --out and --assets", () => {
    const dir = mkdtempSync(join(tmpdir(), "ai-usage-"));
    const dataFile = join(dir, "data.json");
    const outDir = join(dir, "out");
    writeFileSync(
      dataFile,
      JSON.stringify([{ name: "Spec", score: 1, explanation: "gaps" }]),
    );
    execFileSync("node", [
      "tools/ai-usage-report/generate.mjs",
      dataFile,
      "--out",
      outDir,
      "--assets",
      "img/ai",
    ]);
    for (const f of [
      "ai-usage.svg",
      "ai-usage-dark.svg",
      "ai-usage-avg.svg",
      "ai-usage-avg-dark.svg",
      "README-snippet.md",
    ]) {
      assert.ok(existsSync(join(outDir, f)), f);
    }
    const snippet = readFileSync(join(outDir, "README-snippet.md"), "utf8");
    assert.match(snippet, /img\/ai\/ai-usage\.svg/);
  });
});

describe("escapeXml", () => {
  it("escapes all five XML entities", () => {
    assert.equal(escapeXml(`<b>&'"`), "&lt;b&gt;&amp;&#x27;&quot;");
  });

  it("strips characters forbidden in XML 1.0", () => {
    assert.equal(escapeXml("a\u0001b\u001f"), "ab");
  });

  it("keeps permitted C1 characters", () => {
    assert.equal(escapeXml("a\u0085b"), "a\u0085b");
  });
});
