export { cn } from "cn";

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

// Backend timestamps are UTC "YYYY-MM-DD HH:MM:SS" — normalize for Date.
export const formatDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
