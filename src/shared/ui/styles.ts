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
