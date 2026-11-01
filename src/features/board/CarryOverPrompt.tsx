import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteTask, resolveCarryOver } from "@/api/tasks";
import { QUERY_KEYS } from "@/api/queryKeys";
import type { Task } from "@/api/bindings";
import { ButtonVariant, CarryOverDecision } from "@/lib/enums";
import {
  CARRY_OVER_APPLY_LABEL,
  CARRY_OVER_CARRY_LABEL,
  CARRY_OVER_DEFER_LABEL,
  CARRY_OVER_DISMISS_LABEL,
  CARRY_OVER_HINT,
  CARRY_OVER_RETURN_LABEL,
  CARRY_OVER_TITLE,
} from "@/lib/labels";
import { AlertDialog } from "@/shared/ui/AlertDialog";
import { Button } from "@/shared/ui/Button";
import { RadioGroup } from "@/shared/ui/RadioGroup";
import { ERROR_TEXT } from "@/shared/ui/styles";

// The three per-task outcomes, in display order (spec §79/§356):
// Carry/Return serialize to the wire's CarryOverRule; Dismiss deletes.
const DECISIONS = [
  [CarryOverDecision.Carry, CARRY_OVER_CARRY_LABEL],
  [CarryOverDecision.Return, CARRY_OVER_RETURN_LABEL],
  [CarryOverDecision.Dismiss, CARRY_OVER_DISMISS_LABEL],
] as const;

// A decision radio's segment-pill look: it fills with the primary color
// while checked — carried via data-checked/data-unchecked so the state
// styling rides the attributes like every other migrated control.
const DECISION_RADIO_CLASSES =
  "px-3 py-1.5 data-[checked]:bg-primary data-[checked]:font-medium data-[checked]:text-on-primary data-[unchecked]:text-text-muted data-[unchecked]:hover:text-text";

interface CarryOverPromptProps {
  tasks: Task[];
  onDone: () => void;
}

/// Week-start prompt (spec §344/§356): incomplete tasks from past weeks
/// without a carry-over rule get an explicit decision — carry into this
/// week's weekly backlog or return to the global backlog.
///
/// Composed on AlertDialog parts rather than ConfirmDialog for the same
/// reason DeleteProfileDialog composes on Dialog parts: parity decides
/// the primitive per call site. The legacy surface was NON-DISMISSIBLE —
/// no Escape, no outside press, no close affordance. AlertDialog already
/// suppresses outside press, and with `open` controlled and no
/// onOpenChange wired, Escape's close request has no effect either —
/// only the Defer and Apply buttons leave (both via onDone).
export function CarryOverPrompt({
  tasks,
  onDone,
}: Readonly<CarryOverPromptProps>) {
  const queryClient = useQueryClient();
  // Local decision per task — unset until picked; Dismiss deletes.
  const [choices, setChoices] = useState<Record<number, CarryOverDecision>>({});
  const resolved = tasks.filter((t) => choices[t.id]).length;

  const apply = useMutation({
    mutationFn: async () => {
      // Attempt each decision and clear it once committed — a partial
      // failure retries only the remaining ones (a deleted task's
      // repeat call would fail and block the rest).
      const results = await Promise.allSettled(
        tasks.map(async (t) => {
          const decision = choices[t.id];
          if (decision === CarryOverDecision.Dismiss) await deleteTask(t.id);
          else if (decision) await resolveCarryOver(t.id, decision);
          if (decision) {
            setChoices((c) =>
              Object.fromEntries(
                Object.entries(c).filter(([id]) => Number(id) !== t.id),
              ),
            );
          }
        }),
      );
      const failure = results.find((r) => r.status === "rejected");
      if (failure) {
        throw failure.reason instanceof Error
          ? failure.reason
          : new Error(String(failure.reason));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.boardWeeks });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.pendingCarryOver,
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      onDone();
    },
  });

  const choose = (id: number, rule: CarryOverDecision) =>
    setChoices((c) => ({ ...c, [id]: rule }));

  return (
    <AlertDialog.Root open>
      <AlertDialog.Portal>
        <AlertDialog.Viewport>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup className="gap-4">
            <AlertDialog.Title>{CARRY_OVER_TITLE}</AlertDialog.Title>
            <AlertDialog.Description>{CARRY_OVER_HINT}</AlertDialog.Description>
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-4 rounded-md bg-surface-raised px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {t.title}
                  </span>
                  {/* Each task's group is named after the task so screen
                      readers announce which row the radios decide. The
                      empty-string value stands in for "undecided" — no
                      radio carries it, so nothing reports checked. */}
                  <RadioGroup.Root
                    aria-label={t.title}
                    className="overflow-hidden rounded-md border border-border text-xs"
                    value={choices[t.id] ?? ""}
                    onValueChange={(value) => choose(t.id, value)}
                  >
                    {DECISIONS.map(([rule, label]) => (
                      <RadioGroup.Radio
                        key={rule}
                        value={rule}
                        className={DECISION_RADIO_CLASSES}
                      >
                        {label}
                      </RadioGroup.Radio>
                    ))}
                  </RadioGroup.Root>
                </li>
              ))}
            </ul>
            {apply.isError && (
              <p role="alert" className={ERROR_TEXT}>
                {apply.error.message}
              </p>
            )}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant={ButtonVariant.Ghost}
                onClick={onDone}
              >
                {CARRY_OVER_DEFER_LABEL}
              </Button>
              <Button
                type="button"
                disabled={resolved < tasks.length || apply.isPending}
                onClick={() => apply.mutate()}
              >
                {CARRY_OVER_APPLY_LABEL}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
