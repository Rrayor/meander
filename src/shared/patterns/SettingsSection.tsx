import { useId } from "react";

import type { ReactNode } from "react";

// The section card repeated on SettingsPage: an aria-labelledby <section>
// with a level-2 heading, an optional muted description, and the section
// body in an `mt-4` container.
//
// Canonical recipe is the newer threshold-era pair (ThresholdSection,
// CategoryThresholdsSection): h2 `text-base font-semibold text-text`,
// description `mt-1 text-sm text-text-muted`, body `mt-4`. The four older
// sections diverge (h2 `text-lg font-semibold` or
// `text-sm font-medium tracking-tight`, section `flex flex-col gap-3`,
// no body container) — they normalize to this recipe at migration, with
// per-site `className` overrides where pixels must be preserved.
//
// `id` sets the heading id so consumers can keep stable
// `aria-labelledby` targets (the smoke e2e selects
// `section[aria-labelledby='…-heading']`); it defaults to a generated id.

interface SettingsSectionProps {
  title: string;
  /** Heading id — also wired as the section's aria-labelledby. */
  id?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  id,
  description,
  children,
  className,
}: Readonly<SettingsSectionProps>) {
  const generatedId = useId();
  const headingId = id ?? generatedId;

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="text-base font-semibold text-text">
        {title}
      </h2>
      {description !== undefined && (
        <p className="mt-1 text-sm text-text-muted">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export type { SettingsSectionProps };
