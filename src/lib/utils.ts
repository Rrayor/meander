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
export const formatDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
