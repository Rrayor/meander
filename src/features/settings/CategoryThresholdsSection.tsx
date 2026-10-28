import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { listCategories, setCategoryThreshold } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import { MAX_DURATION_MINUTES } from "@/lib/constants";
import {
  CATEGORY_THRESHOLDS_HEADING,
  CATEGORY_THRESHOLDS_HEADING_ID,
  CATEGORY_THRESHOLDS_HINT,
  THRESHOLD_COLOR_LABEL,
  THRESHOLD_FIELD_LABEL,
  SAVE_BUTTON_LABEL,
  formatMinutes,
  thresholdColorLabel,
} from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { ColorRadios } from "@/features/settings/ColorRadios";

const schema = z.object({
  rows: z.record(
    z.string(),
    z.object({
      minutes: z.number().int().min(1).max(MAX_DURATION_MINUTES).nullable(),
      color: z.string(),
    }),
  ),
});
type FormValues = z.infer<typeof schema>;

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
      for (const c of categories ?? []) {
        const row = v.rows[c.id];
        if (!row) continue;
        const storedMinutes = c.threshold_minutes;
        const storedColor = c.threshold_color ?? "";
        if (row.minutes === storedMinutes && row.color === storedColor)
          continue;
        await setCategoryThreshold(
          c.id,
          row.minutes,
          row.minutes == null ? null : row.color || null,
        );
      }
    },
    onSettled: () => {
      // Refetch even on a partial batch — earlier rows may have saved
      // before a later one failed, and the stored values must resync.
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.categories,
      });
    },
  });

  if (categoriesError) {
    return (
      <section aria-labelledby={CATEGORY_THRESHOLDS_HEADING_ID}>
        <p role="alert" className="text-sm text-error">
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
          const color = rows?.[c.id]?.color ?? "";
          return (
            <div key={c.id} className="rounded-lg bg-surface p-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-text">{c.title}</span>
                <label className="text-sm text-text-muted">
                  {THRESHOLD_FIELD_LABEL}
                  <input
                    type="number"
                    min={1}
                    max={MAX_DURATION_MINUTES}
                    placeholder={String(MAX_DURATION_MINUTES)}
                    aria-label={thresholdColorLabel(c.title)}
                    aria-invalid={rowError != null}
                    aria-describedby={
                      rowError != null
                        ? `cat-threshold-${c.id}-error`
                        : undefined
                    }
                    {...register(`rows.${c.id}.minutes`, {
                      setValueAs: (v: string) => (v === "" ? null : Number(v)),
                    })}
                    className="mt-1 block w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-sm text-text placeholder:text-text-muted"
                  />
                </label>
                {rowError && (
                  <p
                    id={`cat-threshold-${c.id}-error`}
                    role="alert"
                    className="mt-1 text-sm text-error"
                  >
                    {formatMinutes(1)}–{formatMinutes(MAX_DURATION_MINUTES)}
                  </p>
                )}
              </div>
              {/* A category without a threshold has no color to pick —
                  an unset row must not read as a custom selection. */}
              {rows?.[c.id]?.minutes != null && (
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
        <p role="alert" className="mt-3 text-sm text-error">
          {errorMessage(save.error)}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={!isDirty || save.isPending}
          onClick={() => void handleSubmit((v) => save.mutate(v))()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {SAVE_BUTTON_LABEL}
        </button>
      </div>
    </section>
  );
}
