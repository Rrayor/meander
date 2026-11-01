import { useId } from "react";

import type { ReactNode } from "react";

// The section card repeated on SettingsPage: an aria-labelledby <section>
// with a level-2 heading, an optional muted description, and the section
// body in an `mt-4` container.
//
// Canonical recipe is the newer threshold-era pair (ThresholdSection,
// CategoryThresholdsSection): h2 `text-base font-semibold text-text`,
// description `mt-1 text-sm text-text-muted`, body `mt-4`. The three
// older sections diverge (h2 `text-lg font-semibold` or
// `text-sm font-medium tracking-tight`, section `flex flex-col gap-3`,
// no body container) — they keep their pixels via the `headingClassName`
// / `bodyClassName` overrides (`contents` lets a gap-spaced section
// space the children itself).
//
// `id` sets the heading id so consumers can keep stable
// `aria-labelledby` targets (the smoke e2e selects
// `section[aria-labelledby='…-heading']`); it defaults to a generated id.

const HEADING_CLASSES = "text-base font-semibold text-text";
const BODY_CLASSES = "mt-4";

interface SettingsSectionProps {
  title: string;
  /** Heading id — also wired as the section's aria-labelledby. */
  id?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** h2 recipe — defaults to the canonical classes; pass the section's
      legacy classes where its pixels must be preserved. */
  headingClassName?: string;
  /** Body wrapper classes — defaults to `mt-4`; pass `contents` when the
      section's own `gap` should space the children (they then render as
      if they were direct section children). */
  bodyClassName?: string;
}

export function SettingsSection({
  title,
  id,
  description,
  children,
  className,
  headingClassName,
  bodyClassName,
}: Readonly<SettingsSectionProps>) {
  const generatedId = useId();
  const headingId = id ?? generatedId;

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className={headingClassName ?? HEADING_CLASSES}>
        {title}
      </h2>
      {description !== undefined && (
        <p className="mt-1 text-sm text-text-muted">{description}</p>
      )}
      <div className={bodyClassName ?? BODY_CLASSES}>{children}</div>
    </section>
  );
}

export type { SettingsSectionProps };
