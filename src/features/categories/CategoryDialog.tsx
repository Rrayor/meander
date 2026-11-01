import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { useRef } from "react";
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
import { ButtonVariant } from "@/lib/enums";
import {
  CANCEL_BUTTON_LABEL,
  CATEGORY_TITLE_REQUIRED_MESSAGE,
  CLOSE_LABEL,
  COLOR_FIELD_LABEL,
  CUSTOM_COLOR_LABEL,
  CUSTOM_COLOR_GRADIENT,
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
import { FormDialog } from "@/shared/patterns/FormDialog";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { RadioGroup } from "@/shared/ui/RadioGroup";
import { Textarea } from "@/shared/ui/Textarea";

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

// FormDialog's footer row renders outside the body slot, so the submit
// button associates with the form by id rather than by nesting.
const CATEGORY_FORM_ID = "category-form";
// Element ids kept stable — e2e and unit selectors depend on them.
const TITLE_INPUT_ID = "category-title-input";
const TITLE_ERROR_ID = "category-title-error";
const DESCRIPTION_INPUT_ID = "category-description";
const DESCRIPTION_ERROR_ID = "category-description-error";
const COLOR_LABEL_ID = "category-color-label";

// RadioGroup member values must be non-empty strings and can never
// collide with a real pick — a color is always a #rrggbb hex or the
// empty "no pick" the field stores for the backend default.
const DEFAULT_SWATCH_VALUE = "__default__";
const CUSTOM_SWATCH_VALUE = "__custom__";

// inline-block is required — Base UI radios render <span>, which ignores
// h-*/w-* utilities while inline and would collapse the swatch to 0×0.
const SWATCH_CLASSES =
  "inline-block h-6 w-6 rounded-full transition-all data-[checked]:ring-2 data-[checked]:ring-primary data-[checked]:ring-offset-2 data-[checked]:ring-offset-surface data-[unchecked]:hover:scale-110";

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

  const colorInputRef = useRef<HTMLInputElement>(null);
  const {
    register,
    control,
    handleSubmit,
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

  // Chrome parity comes from the parts: Escape/outside-press dismissal
  // and the focus trap are FormDialog/Dialog behavior (the hand-rolled
  // backdrop button and document keydown listener are gone). Focus lands
  // on the title field on open — FocusManager owns the mechanism now,
  // not a post-mount setFocus.
  return (
    <FormDialog
      open
      onClose={onClose}
      title={category ? EDIT_CATEGORY_HEADING : NEW_CATEGORY_HEADING}
      closeLabel={CLOSE_LABEL}
      initialFocus={() => document.getElementById(TITLE_INPUT_ID)}
      footer={
        <>
          {/* mousedown preventDefault keeps focus in the field on press —
              otherwise the blur's onTouched validation mounts an alert
              mid-gesture and the footer slides out from under the
              pointer, eating the click. */}
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
          >
            {CANCEL_BUTTON_LABEL}
          </Button>
          <Button
            type="submit"
            form={CATEGORY_FORM_ID}
            onMouseDown={(e) => e.preventDefault()}
            disabled={submit.isPending}
          >
            {category ? SAVE_BUTTON_LABEL : CREATE_CATEGORY_LABEL}
          </Button>
        </>
      }
    >
      <form
        id={CATEGORY_FORM_ID}
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Field.Root invalid={errors.title != null}>
          <Field.Label>{TITLE_FIELD_LABEL} *</Field.Label>
          <Field.Control
            // The category title keeps the source's full-opacity
            // placeholder — FIELD_SURFACE defaults to /60.
            render={<Input className="placeholder:text-text-muted" />}
            id={TITLE_INPUT_ID}
            type="text"
            placeholder="e.g. Engineering or Research"
            {...register("title")}
          />
          {errors.title != null && (
            <Field.Error match={true} id={TITLE_ERROR_ID}>
              {errors.title.message}
            </Field.Error>
          )}
        </Field.Root>
        <Field.Root invalid={errors.description != null}>
          <Field.Label>
            {DESCRIPTION_FIELD_LABEL}{" "}
            <span className="text-text-muted">{OPTIONAL_FIELD_LABEL}</span>
          </Field.Label>
          <Field.Control
            render={<Textarea rows={3} />}
            id={DESCRIPTION_INPUT_ID}
            placeholder="Add context or scope for this category"
            {...register("description")}
          />
          {errors.description != null && (
            <Field.Error match={true} id={DESCRIPTION_ERROR_ID}>
              {errors.description.message}
            </Field.Error>
          )}
        </Field.Root>
        <div className="flex flex-col gap-1.5">
          <span
            id={COLOR_LABEL_ID}
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
                <RadioGroup.Root
                  aria-labelledby={COLOR_LABEL_ID}
                  className="flex-wrap gap-2"
                  value={
                    value === ""
                      ? DEFAULT_SWATCH_VALUE
                      : customSelected
                        ? CUSTOM_SWATCH_VALUE
                        : value
                  }
                  onValueChange={(next) => {
                    // The custom swatch is a picker shortcut, not a
                    // stored value — activating it opens the color
                    // input; the picked hex arrives through the input's
                    // own change handler.
                    if (next === CUSTOM_SWATCH_VALUE) {
                      colorInputRef.current?.click();
                      return;
                    }
                    onChange(next === DEFAULT_SWATCH_VALUE ? "" : next);
                  }}
                >
                  <RadioGroup.Radio
                    value={DEFAULT_SWATCH_VALUE}
                    aria-label={DEFAULT_COLOR_LABEL}
                    // Unlike the palette swatches the default stays put
                    // on hover — the dashed ring is its only affordance.
                    className="inline-block h-6 w-6 rounded-full border border-dashed border-border transition-all data-[checked]:ring-2 data-[checked]:ring-primary data-[checked]:ring-offset-2 data-[checked]:ring-offset-surface"
                  />
                  {CATEGORY_COLORS.map((color) => (
                    <RadioGroup.Radio
                      key={color}
                      value={color}
                      aria-label={categorySwatchLabel(color)}
                      style={{ backgroundColor: color }}
                      className={SWATCH_CLASSES}
                    />
                  ))}
                  {/* The radio is the radiogroup member so the custom pick
                      reports aria-checked to AT and is
                      keyboard-activatable; the color input overlays it
                      for pointer interaction. */}
                  <div className="group relative">
                    <RadioGroup.Radio
                      value={CUSTOM_SWATCH_VALUE}
                      aria-label={CUSTOM_COLOR_LABEL}
                      // Reopening the picker on the already-checked radio
                      // produces no onValueChange, so the click itself
                      // opens it — pointer presses land on the overlaying
                      // input and never reach here.
                      onClick={() => colorInputRef.current?.click()}
                      className={cn(
                        SWATCH_CLASSES,
                        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface data-[unchecked]:group-hover:scale-110",
                      )}
                      style={{
                        background: customSelected
                          ? value
                          : CUSTOM_COLOR_GRADIENT,
                      }}
                    />
                    <input
                      ref={colorInputRef}
                      type="color"
                      tabIndex={-1}
                      aria-label={CUSTOM_COLOR_PICKER_LABEL}
                      value={customSelected ? value : DEFAULT_CATEGORY_COLOR}
                      onChange={(e) => onChange(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </div>
                </RadioGroup.Root>
              );
            }}
          />
        </div>
        {serverError && (
          <p role="alert" className="text-sm text-danger">
            {serverError}
          </p>
        )}
      </form>
    </FormDialog>
  );
}
