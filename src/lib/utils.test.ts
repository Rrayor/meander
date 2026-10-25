import { Weekday } from "@/lib/enums";
import {
  codePointsWithin,
  formatDate,
  formatIsoDay,
  todayLocalIso,
  unicodeTrim,
  weekDates,
  weekdayOfIso,
} from "@/lib/utils";
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

describe("todayLocalIso", () => {
  const atLocal = (year: number, month: number, day: number, h = 0, m = 0) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(year, month, day, h, m));
    try {
      return todayLocalIso();
    } finally {
      vi.useRealTimers();
    }
  };

  it("formats the local calendar date, not the UTC date", () => {
    // Late local evening — the UTC date can already differ.
    expect(atLocal(2026, 9, 21, 23, 59)).toBe("2026-10-21");
  });

  it("does not roll over at midnight UTC, only at local midnight", () => {
    expect(atLocal(2026, 9, 21, 0, 0)).toBe("2026-10-21");
    expect(atLocal(2026, 9, 20, 23, 59)).toBe("2026-10-20");
  });

  it("zero-pads single-digit months and days", () => {
    expect(atLocal(2026, 0, 5)).toBe("2026-01-05");
  });

  it("handles the year boundary", () => {
    expect(atLocal(2026, 11, 31, 23, 59)).toBe("2026-12-31");
    expect(atLocal(2027, 0, 1, 0, 0)).toBe("2027-01-01");
  });
});

describe("weekdayOfIso", () => {
  const WEDNESDAY_ISO = "2026-10-21";
  const SUNDAY_ISO = "2026-10-25";

  it("maps a local ISO date to its weekday", () => {
    expect(weekdayOfIso(WEDNESDAY_ISO)).toBe(Weekday.Wednesday); // a Wednesday
    expect(weekdayOfIso(SUNDAY_ISO)).toBe(Weekday.Sunday);
  });

  it("covers every weekday", () => {
    // 2026-10-19 is a Monday — the week below spans all seven values.
    const week = [
      ["2026-10-19", Weekday.Monday],
      ["2026-10-20", Weekday.Tuesday],
      [WEDNESDAY_ISO, Weekday.Wednesday],
      ["2026-10-22", Weekday.Thursday],
      ["2026-10-23", Weekday.Friday],
      ["2026-10-24", Weekday.Saturday],
      [SUNDAY_ISO, Weekday.Sunday],
    ] as const;
    for (const [iso, weekday] of week) {
      expect(weekdayOfIso(iso), iso).toBe(weekday);
    }
  });

  it("maps a leap day correctly", () => {
    expect(weekdayOfIso("2024-02-29")).toBe(Weekday.Thursday);
  });

  it("is correct on a DST transition date", () => {
    // CET→CEST switch 2026-03-29 (a Sunday): the noon anchor keeps the
    // lookup clear of the 02:00 clock jump.
    expect(weekdayOfIso("2026-03-29")).toBe(Weekday.Sunday);
  });

  it("returns undefined for unparseable input rather than a wrong weekday", () => {
    expect(weekdayOfIso("not-a-date")).toBeUndefined();
    expect(weekdayOfIso("")).toBeUndefined();
  });
});

describe("formatDate", () => {
  it("renders the backend UTC timestamp under a pinned locale", () => {
    // en-US gives a deterministic contract: month short, day, full year.
    expect(formatDate("2026-10-11 10:00:00", "en-US")).toBe("Oct 11, 2026");
  });
});

describe("formatIsoDay", () => {
  it("renders a plain calendar date under a pinned locale", () => {
    // "YYYY-MM-DD" carries no time — formatDate's datetime assumption used
    // to produce "Invalid Date" for series start/end.
    expect(formatIsoDay("2026-10-05", "en-US")).toBe("Oct 5, 2026");
  });
});

describe("weekDates", () => {
  const WEDNESDAY = "2026-10-21";

  it("anchors the week at a Monday week start", () => {
    expect(weekDates(WEDNESDAY, Weekday.Monday)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });

  it("anchors the week at a Sunday week start", () => {
    expect(weekDates(WEDNESDAY, Weekday.Sunday)).toEqual([
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ]);
  });

  it("starts a new week when the date lands on the start day", () => {
    expect(weekDates("2026-10-19", Weekday.Monday)[0]).toBe("2026-10-19");
  });

  it("wraps across a month boundary", () => {
    expect(weekDates("2026-11-01", Weekday.Monday)[0]).toBe("2026-10-26");
  });
});
