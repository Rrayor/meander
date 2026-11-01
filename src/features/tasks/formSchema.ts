import { z } from "zod";

import {
  MAX_DURATION_MINUTES,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_TITLE_LENGTH,
} from "@/api/tasks";
import {
  TASK_DESCRIPTION_TOO_LONG_MESSAGE,
  TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
  TASK_TITLE_TOO_LONG_MESSAGE,
} from "@/lib/errors";
import { CarryOverRule } from "@/lib/enums";
import { TITLE_REQUIRED_MESSAGE } from "@/lib/labels";
import { codePointsWithin, unicodeTrim } from "@/lib/utils";

// The zod/react-hook-form pieces shared by the new- and edit-task forms —
// previously copy-pasted verbatim between NewTaskDialog and EditTaskDialog.
// Each dialog composes the exported field schemas into its own object and
// layers its own superRefine on top (the edit form also validates the
// spent pair and status).

/** Form values covered by `TaskFormFields` — the edit form's shape is a
    superset (it adds the spent pair and status). */
export interface TaskFormValues {
  title: string;
  description: string;
  estHours: string;
  estMinutes: string;
  carryOver: CarryOverRule;
}

export const optionalDurationPart = (unit: string) =>
  z.string().regex(/^\d*$/, `${unit} must be a positive whole number`);

export const durationHoursPart = optionalDurationPart("Hours");
export const durationMinutesPart = optionalDurationPart("Minutes");

export const taskTitleField = z
  .string()
  .transform(unicodeTrim)
  .pipe(
    z
      .string()
      .min(1, TITLE_REQUIRED_MESSAGE)
      .refine((s) => codePointsWithin(s, MAX_TASK_TITLE_LENGTH), {
        message: TASK_TITLE_TOO_LONG_MESSAGE,
      })
      .refine((s) => !/\p{Cc}/u.test(s), {
        message: TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
      }),
  );

export const taskDescriptionField = z
  .string()
  .refine((s) => codePointsWithin(s, MAX_TASK_DESCRIPTION_LENGTH), {
    message: TASK_DESCRIPTION_TOO_LONG_MESSAGE,
  });

/** The fields `TaskFormFields` renders — `z.object(taskFieldSchemas)` is
    the new-task form; the edit form spreads them and adds its own. */
export const taskFieldSchemas = {
  title: taskTitleField,
  description: taskDescriptionField,
  estHours: durationHoursPart,
  estMinutes: durationMinutesPart,
  carryOver: z.enum(CarryOverRule),
};

/** Field paths receiving a duration-range issue — the error is shared by
    the h/min pair, so both inputs land in its aria-describedby. */
export const ESTIMATE_DURATION_FIELDS = ["estHours", "estMinutes"] as const;
export const SPENT_DURATION_FIELDS = ["spentHours", "spentMinutes"] as const;

// The schema CHECK allows 1–1440 minutes for a duration. Both-blank means
// unset; otherwise the h/min pair must total inside the range, and the
// issue is attached to BOTH fields since either value can be the offender.
export function refineDurationRange(
  hours: string,
  minutes: string,
  fields: readonly [string, string],
  message: string,
  ctx: z.RefinementCtx,
) {
  if (hours.trim() === "" && minutes.trim() === "") {
    return;
  }
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  if (total < 1 || total > MAX_DURATION_MINUTES) {
    for (const field of fields) {
      ctx.addIssue({ code: "custom", path: [field], message });
    }
  }
}

// Both-blank means unset (null); otherwise the pair sums to minutes.
export function durationPartsToMinutes(hours: string, minutes: string) {
  return hours.trim() === "" && minutes.trim() === ""
    ? null
    : (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}
