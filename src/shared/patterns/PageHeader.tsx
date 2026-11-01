import { cn } from "cn";

import type { ReactNode } from "react";

// The page-top chrome repeated on every route: a bordered band holding the
// level-1 heading, an optional muted subtitle under it, and an optional
// trailing actions slot.
//
// Byte-parity with the source pages:
// - SettingsPage (title only): the bare <h1> is a direct <header> child —
//   the subtitle <div> wrapper only exists when `description` is given.
// - CategoriesPage/BacklogPage (title + subtitle): `description` renders
//   the shared `<div><h1/><p class="text-sm text-text-muted"/></div>`
//   shape verbatim.
// - BoardPage (title + controls + summary): `actions` is rendered as a
//   raw trailing header child, so callers keep owning their row markup
//   (`<div className="relative flex items-center gap-1">…`) and can pass
//   `className="flex-wrap justify-between gap-2"` for the source layout.
//   A plain action caller should supply its own right-aligned row
//   (e.g. `ml-auto flex items-center gap-2`) — the header itself does not
//   justify, matching the three no-action source pages byte-for-byte.

interface PageHeaderProps {
  title: string;
  /** Optional muted line rendered under the title (page subtitle). */
  description?: string;
  /** Trailing header content — callers own the row's classes. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: Readonly<PageHeaderProps>) {
  const heading = (
    <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
  );

  return (
    <header
      className={cn(
        "flex items-center border-b border-border px-6 py-3",
        className,
      )}
    >
      {description === undefined ? (
        heading
      ) : (
        <div>
          {heading}
          <p className="text-sm text-text-muted">{description}</p>
        </div>
      )}
      {actions}
    </header>
  );
}

export type { PageHeaderProps };
