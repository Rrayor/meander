import { cn } from "cn";

import { ButtonVariant, ComponentSize } from "@/lib/enums";

import { Button } from "./Button";

import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

// Icon-only buttons are square: swap the text-button padding for a fixed
// box so the glyph always sits centered with uniform hit geometry (the
// chevron/pagination pattern repeated at call sites).
const ICON_BUTTON_SIZES: Record<ComponentSize, { box: string; icon: number }> =
  {
    [ComponentSize.Sm]: { box: "h-6 w-6", icon: 14 },
    [ComponentSize.Md]: { box: "h-7 w-7", icon: 16 },
  };

interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  /** Lucide icon component rendered as the button's only content. */
  icon: LucideIcon;
  /** Accessible name — applied as aria-label. */
  label: string;
  variant?: ButtonVariant;
  size?: ComponentSize;
}

export function IconButton({
  icon: Icon,
  label,
  variant = ButtonVariant.Ghost,
  size = ComponentSize.Md,
  type = "button",
  className,
  ...rest
}: Readonly<IconButtonProps>) {
  const { box, icon: iconSize } = ICON_BUTTON_SIZES[size];
  return (
    <Button
      type={type}
      variant={variant}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center p-0",
        box,
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden="true" size={iconSize} />
    </Button>
  );
}

export type { IconButtonProps };
