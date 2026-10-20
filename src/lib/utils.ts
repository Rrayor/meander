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

// A local calendar date — `toISOString` would take the UTC date and can land
// on tomorrow/yesterday outside UTC.
export const todayLocalIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const WEEKDAYS_BY_JS_DAY = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

// Weekday of a "YYYY-MM-DD" date, read at noon to stay clear of DST edges.
export const weekdayOfIso = (iso: string) =>
  WEEKDAYS_BY_JS_DAY[new Date(`${iso}T12:00:00`).getDay()];
