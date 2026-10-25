import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteTask, resolveCarryOver } from "@/api/tasks";
import { QUERY_KEYS } from "@/api/queryKeys";
import type { Task } from "@/api/bindings";
import { CarryOverDecision } from "@/lib/enums";
import {
  CARRY_OVER_APPLY_LABEL,
  CARRY_OVER_CARRY_LABEL,
  CARRY_OVER_DEFER_LABEL,
  CARRY_OVER_DISMISS_LABEL,
  CARRY_OVER_HINT,
  CARRY_OVER_RETURN_LABEL,
  CARRY_OVER_TITLE,
} from "@/lib/labels";

interface CarryOverPromptProps {
  tasks: Task[];
  onDone: () => void;
}

/// Week-start prompt (spec §344/§356): incomplete tasks from past weeks
/// without a carry-over rule get an explicit decision — carry into this
/// week's weekly backlog or return to the global backlog.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" aria-hidden />
      <dialog
        open
        aria-labelledby="carry-over-title"
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-6 text-text"
      >
        <h2 id="carry-over-title" className="text-base font-semibold">
          {CARRY_OVER_TITLE}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{CARRY_OVER_HINT}</p>
        <ul className="mt-4 space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-4 rounded-md bg-surface-raised px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
              <fieldset className="m-0 flex overflow-hidden rounded-md border border-border p-0 text-xs">
                {(
                  [
                    [CarryOverDecision.Carry, CARRY_OVER_CARRY_LABEL],
                    [CarryOverDecision.Return, CARRY_OVER_RETURN_LABEL],
                    [CarryOverDecision.Dismiss, CARRY_OVER_DISMISS_LABEL],
                  ] as const
                ).map(([rule, label]) => (
                  <button
                    key={rule}
                    type="button"
                    aria-pressed={choices[t.id] === rule}
                    onClick={() => choose(t.id, rule)}
                    className={`px-3 py-1.5 transition-colors ${
                      choices[t.id] === rule
                        ? "bg-primary font-medium text-on-primary"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
            </li>
          ))}
        </ul>
        {apply.isError && (
          <p role="alert" className="mt-3 text-sm text-error">
            {apply.error.message}
          </p>
        )}
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
          >
            {CARRY_OVER_DEFER_LABEL}
          </button>
          <button
            type="button"
            disabled={resolved < tasks.length || apply.isPending}
            onClick={() => apply.mutate()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {CARRY_OVER_APPLY_LABEL}
          </button>
        </div>
      </dialog>
    </div>
  );
}
