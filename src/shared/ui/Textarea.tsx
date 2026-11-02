import { cn } from "cn";

import { FIELD_SURFACE, FOCUS_RING } from "./styles";

import type { ComponentProps } from "react";

// Same recipe family as Input — the description-field textarea at call
// sites adds resize-none. Callers that want a resizable area override it
// with a resize-* className (cn resolves the conflict last-wins).
const TEXTAREA_CLASSES = cn(
  "w-full resize-none",
  FIELD_SURFACE,
  FOCUS_RING,
  "focus:border-primary",
  "aria-[invalid=true]:border-danger data-[invalid]:border-danger",
);

type TextareaProps = ComponentProps<"textarea">;

export function Textarea({ className, ref, ...rest }: Readonly<TextareaProps>) {
  return (
    <textarea ref={ref} className={cn(TEXTAREA_CLASSES, className)} {...rest} />
  );
}

export type { TextareaProps };
