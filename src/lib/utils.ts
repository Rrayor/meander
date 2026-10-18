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
// reject inputs the backend would sanitize and accept.
export const unicodeTrim = (s: string) =>
  s.replace(/^\p{White_Space}+/u, "").replace(/\p{White_Space}+$/u, "");

// Backend timestamps are UTC "YYYY-MM-DD HH:MM:SS" — normalize for Date.
export const formatDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
