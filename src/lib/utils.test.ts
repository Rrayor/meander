import { codePointsWithin, unicodeTrim } from "@/lib/utils";
import { MULTI_UNIT_EMOJI } from "@/test/unicode";

// The regex serves as the oracle: \p{White_Space} is the same Unicode
// property Rust's str::trim uses, so both implementations must agree.
const oracleTrim = (s: string) =>
  s.replace(/^\p{White_Space}+/u, "").replace(/\p{White_Space}+$/u, "");

const ALL_WHITESPACE = [
  ...[0x0009, 0x000a, 0x000b, 0x000c, 0x000d],
  0x0020,
  0x0085,
  0x00a0,
  0x1680,
  ...Array.from({ length: 11 }, (_, i) => 0x2000 + i),
  ...[0x2028, 0x2029, 0x202f, 0x205f, 0x3000],
].map((cp) => String.fromCodePoint(cp));

// Chars that LOOK whitespace-ish but are not White_Space — must not trim.
const NOT_WHITESPACE = [
  ...[0x001c, 0x001d, 0x001e, 0x001f], // information separators (Rust does not trim)
  0x200b, // zero-width space
  0xfeff, // BOM / zero-width no-break space (JS trim removes it; Rust does not)
].map((cp) => String.fromCodePoint(cp));

describe("unicodeTrim", () => {
  it("removes every White_Space char from both edges, matching the oracle", () => {
    for (const ws of ALL_WHITESPACE) {
      const hex = `U+${ws.codePointAt(0)!.toString(16)}`;
      const padded = `${ws}text${ws}`;
      expect(unicodeTrim(padded), hex).toBe(oracleTrim(padded));
    }
  });

  it("preserves interior whitespace", () => {
    expect(unicodeTrim("  a  b  ")).toBe("a  b");
    const nelInterior = "a\u0085b";
    expect(unicodeTrim(nelInterior)).toBe(nelInterior);
  });

  it("handles empty and all-whitespace strings", () => {
    expect(unicodeTrim("")).toBe("");
    expect(unicodeTrim(" 　")).toBe("");
  });

  it("does not remove non-whitespace edge chars", () => {
    for (const ch of NOT_WHITESPACE) {
      const hex = `U+${ch.codePointAt(0)!.toString(16)}`;
      const wrapped = `${ch}a${ch}`;
      expect(unicodeTrim(wrapped), hex).toBe(wrapped);
    }
    // Emoji around the edges must survive (multi-unit code points).
    expect(unicodeTrim(` ${MULTI_UNIT_EMOJI} `)).toBe(MULTI_UNIT_EMOJI);
  });
});

describe("codePointsWithin", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(codePointsWithin(MULTI_UNIT_EMOJI, 1)).toBe(true);
    expect(codePointsWithin("ab", 2)).toBe(true);
    expect(codePointsWithin("abc", 2)).toBe(false);
  });
});
