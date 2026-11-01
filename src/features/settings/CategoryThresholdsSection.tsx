import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { listCategories, setCategoryThresholds } from "@/api/categories";
import type { CategoryThresholdUpdate } from "@/api/bindings";
import { QUERY_KEYS } from "@/api/queryKeys";
import { MAX_DURATION_MINUTES } from "@/lib/constants";
import { Weekday } from "@/lib/enums";
import {
  categoryThresholdDayLabel,
  CATEGORY_THRESHOLDS_HEADING,
  CATEGORY_THRESHOLDS_HEADING_ID,
  CATEGORY_THRESHOLDS_HINT,
  THRESHOLD_COLOR_LABEL,
  THRESHOLD_DAYS_FIELDSET_LABEL,
  THRESHOLD_FIELD_LABEL,
  SAVE_BUTTON_LABEL,
  formatMinutes,
  thresholdColorLabel,
  WEEKDAY_OPTIONS,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { ColorRadios } from "@/features/settings/ColorRadios";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { Fieldset } from "@/shared/ui/Fieldset";
import { Input } from "@/shared/ui/Input";
import { ERROR_TEXT } from "@/shared/ui/styles";

const schema = z.object({
  rows: z.record(
    z.string(),
    z.object({
      minutes: z.number().int().min(1).max(MAX_DURATION_MINUTES).nullable(),
      color: z.string(),
      day_minutes: z.record(
        z.string(),
        z.number().int().min(1).max(MAX_DURATION_MINUTES).nullable(),
      ),
    }),
  ),
});
type FormValues = z.infer<typeof schema>;

const setValueAs = (v: string) => (v === "" ? null : Number(v));

const RANGE_MESSAGE = `${formatMinutes(1)}–${formatMinutes(MAX_DURATION_MINUTES)}`;

/// Per-category per-day thresholds (spec §285): each category may get
/// its own minutes limit and color; unset means no threshold for it.
export function CategoryThresholdsSection() {
  const { data: categories, error: categoriesError } = useQuery({
    queryKey: QUERY_KEYS.categories,
    queryFn: listCategories,
  });
  const queryClient = useQueryClient();
  // Memoized baseline — RHF resets dirty tracking to `values` when it
  // changes, so its identity must stay stable between renders.
  const persisted = useMemo<FormValues>(
    () => ({
      rows: Object.fromEntries(
        (categories ?? []).map((c) => [
          c.id,
          {
            minutes: c.threshold_minutes,
            color: c.threshold_color ?? "",
            day_minutes: Object.fromEntries(
              WEEKDAY_OPTIONS.map((o) => [
                o.value,
                c.threshold_day_minutes?.[o.value] ?? null,
              ]),
            ),
          },
        ]),
      ),
    }),
    [categories],
  );
  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    values: persisted,
  });
  const rows = watch("rows");

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const dayMap = (days: Record<string, number | null | undefined>) =>
        Object.fromEntries(
          Object.entries(days).filter(([, m]) => m != null),
        ) as Partial<Record<Weekday, number>>;
      // Key order differs between the stored map and the form's
      // WEEKDAY_OPTIONS-ordered record — compare by content, not
      // serialization, or untouched rows look dirty.
      const sameDays = (
        a: Record<string, number | null | undefined>,
        b: Record<string, number | null | undefined>,
      ) => {
        const da = dayMap(a);
        const db = dayMap(b);
        const keys = new Set([...Object.keys(da), ...Object.keys(db)]);
        return [...keys].every((k) => da[k as Weekday] === db[k as Weekday]);
      };
      const updates = (categories ?? [])
        .filter((c) => {
          const row = v.rows[c.id];
          if (!row) return false;
          return (
            row.minutes !== c.threshold_minutes ||
            row.color !== (c.threshold_color ?? "") ||
            !sameDays(row.day_minutes, c.threshold_day_minutes ?? {})
          );
        })
        .map((c): CategoryThresholdUpdate => ({
          category_id: c.id,
          minutes: v.rows[c.id]!.minutes,
          color:
            v.rows[c.id]!.minutes == null &&
            Object.keys(dayMap(v.rows[c.id]!.day_minutes)).length === 0
              ? null
              : v.rows[c.id]!.color || null,
          day_minutes: dayMap(v.rows[c.id]!.day_minutes),
        }));
      if (updates.length > 0) await setCategoryThresholds(updates);
    },
    onSuccess: () => {
      // Only refetch on success — a failed batch must not discard
      // unsaved edits on the other rows.
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.categories,
      });
    },
  });

  if (categoriesError) {
    return (
      <section aria-labelledby={CATEGORY_THRESHOLDS_HEADING_ID}>
        <p role="alert" className={ERROR_TEXT}>
          {errorMessage(categoriesError)}
        </p>
      </section>
    );
  }
  if ((categories ?? []).length === 0) return null;
  return (
    <section aria-labelledby={CATEGORY_THRESHOLDS_HEADING_ID}>
      <h2
        id={CATEGORY_THRESHOLDS_HEADING_ID}
        className="text-base font-semibold text-text"
      >
        {CATEGORY_THRESHOLDS_HEADING}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{CATEGORY_THRESHOLDS_HINT}</p>
      <div className="mt-4 flex flex-col gap-4">
        {(categories ?? []).map((c) => {
          const rowError = errors.rows?.[c.id]?.minutes;
          const daysError = errors.rows?.[c.id]?.day_minutes;
          const rowErrorId = `cat-threshold-${c.id}-error`;
          const daysErrorId = `cat-threshold-${c.id}-days-error`;
          const color = rows?.[c.id]?.color ?? "";
          return (
            <div key={c.id} className="rounded-lg bg-surface p-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-text">{c.title}</span>
                {/* The visible "Minutes per day" caption is a plain span:
                    the input's accessible name stays the per-category
                    aria-label it had before — a Field.Label would win
                    the name computation and rename the control. */}
                <Field.Root
                  invalid={rowError != null}
                  className="flex-row items-center gap-4"
                >
                  <span className="flex flex-col gap-1 text-sm text-text-muted">
                    {THRESHOLD_FIELD_LABEL}
                    <Field.Control
                      render={
                        <Input className="w-24 px-2 py-1 placeholder:text-text-muted" />
                      }
                      type="number"
                      min={1}
                      max={MAX_DURATION_MINUTES}
                      placeholder={String(MAX_DURATION_MINUTES)}
                      aria-label={thresholdColorLabel(c.title)}
                      {...register(`rows.${c.id}.minutes`, { setValueAs })}
                    />
                  </span>
                  {rowError && (
                    <Field.Error match={true} id={rowErrorId}>
                      {RANGE_MESSAGE}
                    </Field.Error>
                  )}
                </Field.Root>
              </div>
              {/* §285 per-weekday overrides: an empty day inherits the
                  category's own minutes, shown as the placeholder. One
                  Field.Root per control keeps each input's aria-invalid
                  scoped to its own error; the shared error mounts on the
                  wrapping root (see DurationField for the structure). */}
              <Field.Root
                invalid={daysError != null}
                render={<Fieldset.Root className="mt-3" />}
              >
                <Fieldset.Legend className="font-normal">
                  {THRESHOLD_DAYS_FIELDSET_LABEL}
                </Fieldset.Legend>
                <div className="mt-2 flex gap-2">
                  {WEEKDAY_OPTIONS.map((o) => {
                    const dayError =
                      errors.rows?.[c.id]?.day_minutes?.[o.value];
                    return (
                      <Field.Root key={o.value} invalid={dayError != null}>
                        <span className="text-center text-xs text-text-muted">
                          {o.short}
                        </span>
                        <Field.Control
                          render={
                            <Input className="w-16 px-2 py-1 placeholder:text-text-muted" />
                          }
                          type="number"
                          min={1}
                          max={MAX_DURATION_MINUTES}
                          placeholder={
                            rows?.[c.id]?.minutes != null
                              ? String(rows[c.id].minutes)
                              : ""
                          }
                          aria-label={categoryThresholdDayLabel(
                            c.title,
                            o.label,
                          )}
                          {...register(`rows.${c.id}.day_minutes.${o.value}`, {
                            setValueAs,
                          })}
                        />
                      </Field.Root>
                    );
                  })}
                </div>
                {daysError && (
                  <Field.Error match={true} id={daysErrorId}>
                    {RANGE_MESSAGE}
                  </Field.Error>
                )}
              </Field.Root>
              {/* A category without a threshold has no color to pick —
                  an unset row must not read as a custom selection. A
                  day-only threshold still counts as a threshold. */}
              {(rows?.[c.id]?.minutes != null ||
                Object.values(rows?.[c.id]?.day_minutes ?? {}).some(
                  (m) => m != null,
                )) && (
                <ColorRadios
                  label={`${THRESHOLD_COLOR_LABEL}: ${c.title}`}
                  value={color}
                  onChange={(v) =>
                    setValue(`rows.${c.id}.color`, v, { shouldDirty: true })
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      {save.isError && (
        <p role="alert" className={cn("mt-3", ERROR_TEXT)}>
          {errorMessage(save.error)}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <Button
          type="button"
          disabled={!isDirty || save.isPending}
          onClick={() => void handleSubmit((v) => save.mutate(v))()}
        >
          {SAVE_BUTTON_LABEL}
        </Button>
      </div>
    </section>
  );
}
