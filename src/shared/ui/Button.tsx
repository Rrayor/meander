import { cva } from "class-variance-authority";
import { cn } from "cn";

import { ButtonVariant, ComponentSize } from "@/lib/enums";

import { FOCUS_RING } from "./styles";

import type { ComponentProps } from "react";

// Recipes consolidate the button class strings repeated at call sites
// (e.g. EditTaskDialog footers): variant owns color/weight, size owns
// padding. Every variant keeps the shared focus ring and disabled dim so
// keyboard/disabled affordances can't be dropped at a call site.
const buttonVariants = cva(
  cn("rounded-md text-sm transition-colors", FOCUS_RING, "disabled:opacity-50"),
  {
    variants: {
      variant: {
        [ButtonVariant.Primary]:
          "bg-primary font-semibold text-on-primary hover:brightness-110",
        [ButtonVariant.Secondary]:
          "border border-border font-medium text-text hover:bg-surface-raised",
        [ButtonVariant.Danger]:
          "bg-danger font-medium text-on-primary hover:brightness-110",
        [ButtonVariant.Ghost]:
          "font-medium text-text-muted hover:bg-surface-raised hover:text-text",
      },
      size: {
        [ComponentSize.Sm]: "px-3 py-1.5",
        [ComponentSize.Md]: "px-4 py-2",
      },
    },
    defaultVariants: {
      variant: ButtonVariant.Primary,
      size: ComponentSize.Md,
    },
  },
);

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ComponentSize;
}

export function Button({
  variant,
  size,
  className,
  ref,
  ...rest
}: Readonly<ButtonProps>) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    />
  );
}

export type { ButtonProps };
