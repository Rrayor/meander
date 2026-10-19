import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  THEMES,
  averageScore,
  escapeXml,
  renderBadge,
  renderGauge,
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
    assert.match(svg, /x="84"[^>]*fill="#eef1f6"/);
    assert.match(svg, />3\.5 \/ 5</);
  });

  it("renders an empty bar and em-dash when nothing is rated", () => {
    const svg = renderBadge(null, "light");
    assert.match(svg, />— \/ 5</);
    assert.doesNotMatch(svg, /fill="url\(#/);
  });
});

describe("escapeXml", () => {
  it("escapes all five XML entities", () => {
    assert.equal(escapeXml(`<b>&'"`), "&lt;b&gt;&amp;&#x27;&quot;");
  });
});
