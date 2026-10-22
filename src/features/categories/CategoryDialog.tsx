import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  MAX_CATEGORY_DESCRIPTION_LENGTH,
  MAX_CATEGORY_TITLE_LENGTH,
  createCategory,
  updateCategory,
} from "@/api/categories";
import type { Category } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import {
  CATEGORY_DESCRIPTION_TOO_LONG_MESSAGE,
  CATEGORY_TITLE_INVALID_CHARACTERS_MESSAGE,
  CATEGORY_TITLE_TOO_LONG_MESSAGE,
  serverErrorMessage,
} from "@/lib/errors";
import {
  CANCEL_BUTTON_LABEL,
  CATEGORY_TITLE_REQUIRED_MESSAGE,
  CLOSE_DIALOG_LABEL,
  CLOSE_LABEL,
  COLOR_FIELD_LABEL,
  CUSTOM_COLOR_LABEL,
  CUSTOM_COLOR_PICKER_LABEL,
  DEFAULT_COLOR_LABEL,
  CREATE_CATEGORY_LABEL,
  EDIT_CATEGORY_HEADING,
  SAVE_BUTTON_LABEL,
  DESCRIPTION_FIELD_LABEL,
  NEW_CATEGORY_HEADING,
  OPTIONAL_FIELD_LABEL,
  TITLE_FIELD_LABEL,
  categorySwatchLabel,
} from "@/lib/labels";
import { codePointsWithin, unicodeTrim } from "@/lib/utils";

const schema = z.object({
  title: z
    .string()
    .transform(unicodeTrim)
    .pipe(
      z
        .string()
        .min(1, CATEGORY_TITLE_REQUIRED_MESSAGE)
        .refine((s) => codePointsWithin(s, MAX_CATEGORY_TITLE_LENGTH), {
          message: CATEGORY_TITLE_TOO_LONG_MESSAGE,
        })
        .refine((s) => !/\p{Cc}/u.test(s), {
          message: CATEGORY_TITLE_INVALID_CHARACTERS_MESSAGE,
        }),
    ),
  description: z
    .string()
    .refine((s) => codePointsWithin(s, MAX_CATEGORY_DESCRIPTION_LENGTH), {
      message: CATEGORY_DESCRIPTION_TOO_LONG_MESSAGE,
    }),
  // Empty string = no pick; the backend then defaults to the primary accent.
  color: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface CategoryDialogProps {
  /** When set, the dialog edits this category; otherwise it creates one. */
  category?: Category;
  onClose: () => void;
}

export function CategoryDialog({
  category,
  onClose,
}: Readonly<CategoryDialogProps>) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const colorInputRef = useRef<HTMLInputElement>(null);
  const {
    register,
    control,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      title: category?.title ?? "",
      description: category?.description ?? "",
      color: category?.color ?? "",
    },
  });

  useEffect(() => {
    setFocus("title");
  }, [setFocus]);

  const submit = useMutation({
    mutationFn: (input: Parameters<typeof createCategory>[0]) =>
      category ? updateCategory(category.id, input) : createCategory(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories });
      // A rename/recolor changes what every cached association list shows.
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.allTaskCategories,
      });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.allSeriesCategories,
      });
      onClose();
    },
  });

  const onSubmit = ({ title, description, color }: FormValues) => {
    submit.mutate({
      title,
      description: unicodeTrim(description) || null,
      color: color || null,
    });
  };

  const serverError = serverErrorMessage(submit.error);

  // The backdrop is a real button (pointer + keyboard dismiss) and the panel
  // a native <dialog>; Escape is handled by the document listener above.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={CLOSE_DIALOG_LABEL}
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <dialog
        open
        aria-labelledby="category-dialog-title"
        className="relative m-0 flex w-full max-w-lg flex-col gap-6 rounded-lg border border-border bg-surface p-6 text-text shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2
            id="category-dialog-title"
            className="font-title text-lg font-semibold text-text"
          >
            {category ? EDIT_CATEGORY_HEADING : NEW_CATEGORY_HEADING}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={CLOSE_LABEL}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="category-title-input"
              className="text-xs font-medium text-text-muted"
            >
              {TITLE_FIELD_LABEL} *
            </label>
            <input
              id="category-title-input"
              type="text"
              placeholder="e.g. Engineering or Research"
              aria-invalid={!!errors.title}
              aria-describedby={
                errors.title ? "category-title-error" : undefined
              }
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none ring-primary placeholder:text-text-muted focus:border-primary focus:ring-1"
              {...register("title")}
            />
            {errors.title && (
              <p
                id="category-title-error"
                role="alert"
                className="text-sm text-danger"
              >
                {errors.title.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="category-description"
              className="text-xs font-medium text-text-muted"
            >
              {DESCRIPTION_FIELD_LABEL}{" "}
              <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
            </label>
            <textarea
              id="category-description"
              rows={3}
              placeholder="Add context or scope for this category"
              aria-invalid={!!errors.description}
              aria-describedby={
                errors.description ? "category-description-error" : undefined
              }
              className="w-full resize-none rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary"
              {...register("description")}
            />
            {errors.description && (
              <p
                id="category-description-error"
                role="alert"
                className="text-sm text-danger"
              >
                {errors.description.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span
              id="category-color-label"
              className="text-xs font-medium text-text-muted"
            >
              {COLOR_FIELD_LABEL}
            </span>
            <Controller
              name="color"
              control={control}
              render={({ field: { value, onChange } }) => {
                const customSelected =
                  value !== "" &&
                  !(CATEGORY_COLORS as readonly string[]).includes(value);
                return (
                  <div
                    role="radiogroup"
                    aria-labelledby="category-color-label"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={value === ""}
                      aria-label={DEFAULT_COLOR_LABEL}
                      onClick={() => onChange("")}
                      className={`h-6 w-6 rounded-full border border-dashed border-border transition-all ${
                        value === ""
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                          : ""
                      }`}
                    />
                    {CATEGORY_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={value === color}
                        aria-label={categorySwatchLabel(color)}
                        onClick={() => onChange(color)}
                        style={{ backgroundColor: color }}
                        className={`h-6 w-6 rounded-full transition-all ${
                          value === color
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                            : "hover:scale-110"
                        }`}
                      />
                    ))}
                    {/* The button is the radiogroup member so the custom pick
                        reports aria-checked to AT and is keyboard-activatable;
                        the color input overlays it for pointer interaction. */}
                    <div className="group relative">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={customSelected}
                        aria-label={CUSTOM_COLOR_LABEL}
                        onClick={(e) => {
                          if (e.target === e.currentTarget)
                            colorInputRef.current?.click();
                        }}
                        className={`h-6 w-6 rounded-full transition-all ${
                          customSelected
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                            : "group-hover:scale-110"
                        }`}
                        style={{
                          background: customSelected
                            ? value
                            : "conic-gradient(#f87171, #fbbf24, #4ade80, #22d3ee, #a78bfa, #f472b6, #f87171)",
                        }}
                      />
                      <input
                        ref={colorInputRef}
                        type="color"
                        aria-label={CUSTOM_COLOR_PICKER_LABEL}
                        value={customSelected ? value : DEFAULT_CATEGORY_COLOR}
                        onChange={(e) => onChange(e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </div>
                  </div>
                );
              }}
            />
          </div>
          {serverError && (
            <p role="alert" className="text-sm text-danger">
              {serverError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              {CANCEL_BUTTON_LABEL}
            </button>
            <button
              type="submit"
              disabled={submit.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              {category ? SAVE_BUTTON_LABEL : CREATE_CATEGORY_LABEL}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
