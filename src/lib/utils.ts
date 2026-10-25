import { Weekday } from "@/lib/enums";

export { cn } from "cn";

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

// Rust's len_char_* counts Unicode scalar values; JS string length and
// zod .max() count UTF-16 units, so multi-byte chars would hit a stricter
// limit client-side than the backend's. [...s].length matches chars().count().
export const codePointsWithin = (s: string, max: number) =>
  [...s].length <= max;

// Rust's str::trim removes all Unicode White_Space characters (incl. U+0085
// NEL); JS String.trim() does not. Mirror the backend so the client doesn't
// reject inputs the backend would sanitize and accept. The set below is the
// complete 25-char White_Space property (what char::is_whitespace tests) —
// notably excluding U+001C–U+001F and U+FEFF, which JS trim() treats
// differently.
const UNICODE_WHITESPACE = new Set(
  [
    0x0009,
    0x000a,
    0x000b,
    0x000c,
    0x000d,
    0x0020,
    0x0085,
    0x00a0,
    0x1680,
    0x2028,
    0x2029,
    0x202f,
    0x205f,
    0x3000,
    ...Array.from({ length: 11 }, (_, i) => 0x2000 + i),
  ].map((cp) => String.fromCodePoint(cp)),
);

// Every White_Space code point is BMP, so plain UTF-16 indexing is exact —
// no surrogate handling or array allocation needed.
export const unicodeTrim = (s: string) => {
  let start = 0;
  let end = s.length;
  while (start < end && UNICODE_WHITESPACE.has(s[start])) start++;
  while (end > start && UNICODE_WHITESPACE.has(s[end - 1])) end--;
  return s.slice(start, end);
};

// Backend timestamps are UTC "YYYY-MM-DD HH:MM:SS" — normalize for Date.
// `locale` exists for tests pinning a deterministic rendering.
export const formatDate = (iso: string, locale?: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// Plain "YYYY-MM-DD" calendar dates (series start/end) carry no time —
// render them in UTC so the day never shifts with the local timezone.
export const formatIsoDay = (iso: string, locale?: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// A local calendar date — `toISOString` would take the UTC date and can land
// on tomorrow/yesterday outside UTC.
export const todayLocalIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const WEEKDAY_INDEX: Record<Weekday, number> = {
  [Weekday.Monday]: 0,
  [Weekday.Tuesday]: 1,
  [Weekday.Wednesday]: 2,
  [Weekday.Thursday]: 3,
  [Weekday.Friday]: 4,
  [Weekday.Saturday]: 5,
  [Weekday.Sunday]: 6,
};

const localIso = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// The 7 ISO dates of the week containing `iso`, anchored at the
// configured week-start weekday — mirrors tasks::list_week's bounds.
export const weekDates = (iso: string, weekStart: Weekday) => {
  const day = new Date(`${iso}T00:00:00`);
  const start = new Date(day);
  start.setDate(
    day.getDate() -
      ((((day.getDay() + 6 - WEEKDAY_INDEX[weekStart]) % 7) + 7) % 7),
  );
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return localIso(d);
  });
};

/// Shift a "YYYY-MM-DD" date by whole days, read at noon to stay
/// clear of DST edges (same convention as weekdayOfIso).
export const shiftDays = (iso: string, delta: number) => {
  const day = new Date(`${iso}T12:00:00`);
  day.setDate(day.getDate() + delta);
  return localIso(day);
};

export const WEEKDAYS_BY_JS_DAY = [
  Weekday.Sunday,
  Weekday.Monday,
  Weekday.Tuesday,
  Weekday.Wednesday,
  Weekday.Thursday,
  Weekday.Friday,
  Weekday.Saturday,
] as const;

// Weekday of a "YYYY-MM-DD" date, read at noon to stay clear of DST edges.
export const weekdayOfIso = (iso: string) =>
  WEEKDAYS_BY_JS_DAY[new Date(`${iso}T12:00:00`).getDay()];
