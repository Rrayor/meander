import { cn } from "cn";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Centered empty-state block: optional decorative icon, a muted title
// line, optional muted description, and an optional action slot.
//
// Recipe choice — of the three source empty states, the CategoriesPage
// `py-12 text-center` block-centering is the canonical one: it works in
// normal flow without a sized parent. BacklogPage's `flex h-full` variant
// fills its scroll section instead; that parity is reachable via
// `className="h-full"` (the flex centering is already in the recipe).
// NoteList's inline italic message is a one-line text state, not a block
// — not a target of this pattern.
//
// Title and description keep the source `text-sm text-text-muted`
// styling; the icon is decorative (aria-hidden — the title carries the
// accessible text).

interface EmptyStateProps {
  /** Decorative icon rendered above the title. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optional call-to-action rendered below the text. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: Readonly<EmptyStateProps>) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center",
        className,
      )}
    >
      {Icon !== undefined && (
        <Icon aria-hidden="true" size={32} className="text-text-muted" />
      )}
      <p className="text-sm text-text-muted">{title}</p>
      {description !== undefined && (
        <p className="text-sm text-text-muted">{description}</p>
      )}
      {action}
    </div>
  );
}

export type { EmptyStateProps };
