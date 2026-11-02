import { cn } from "cn";

// Shared Tailwind class fragments for the shared/ui primitives.
// Compose these into component class strings instead of re-typing the
// classes — keeping the focus ring, field surface, and error styling
// identical across controls is the point of the primitive layer.

/** Standard focus-visible ring for interactive controls. */
export const FOCUS_RING = "focus:outline-none focus:ring-1 focus:ring-primary";

/** Surface styling shared by text-like form fields (input, textarea). */
export const FIELD_SURFACE =
  "rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60";

/** Inline form-error text (paired with role="alert"). */
export const ERROR_TEXT = "text-sm text-danger";

/**
 * Merge a primitive's base classes with a Base UI part `className`, which
 * may be a string or a state callback. Wrapping both forms keeps the full
 * Base UI signature for callers while the primitive's recipe stays
 * underneath — caller classes still merge last through `cn`.
 */
export function mergePartClassName<State>(
  base: string,
  className?: string | ((state: State) => string | undefined),
): (state: State) => string {
  return (state) =>
    cn(base, typeof className === "function" ? className(state) : className);
}
