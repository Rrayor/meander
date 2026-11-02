import { cn } from "cn";

import { FIELD_SURFACE, FOCUS_RING } from "./styles";

import type { ComponentProps } from "react";

// Recipe consolidates the full-width text-input class string repeated at
// call sites (e.g. EditTaskDialog). FIELD_SURFACE owns surface/border,
// FOCUS_RING the focus affordance; the danger border applies whether the
// invalid marker arrives as aria-invalid (react-hook-form) or
// data-invalid (Base UI Field state).
const INPUT_CLASSES = cn(
  "w-full",
  FIELD_SURFACE,
  FOCUS_RING,
  "focus:border-primary",
  "aria-[invalid=true]:border-danger data-[invalid]:border-danger",
);

type InputProps = ComponentProps<"input">;

export function Input({ className, ref, ...rest }: Readonly<InputProps>) {
  return <input ref={ref} className={cn(INPUT_CLASSES, className)} {...rest} />;
}

export type { InputProps };
