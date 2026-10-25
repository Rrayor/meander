import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { resolveCarryOver } from "@/api/tasks";
import { QUERY_KEYS } from "@/api/queryKeys";
import type { CarryOverRule, Task } from "@/api/bindings";
import {
  CARRY_OVER_APPLY_LABEL,
  CARRY_OVER_CARRY_LABEL,
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
  // Local decision per task — default is unset until the user picks.
  const [choices, setChoices] = useState<Record<number, CarryOverRule>>({});
  const resolved = tasks.filter((t) => choices[t.id]).length;

  const apply = useMutation({
    mutationFn: async () => {
      for (const t of tasks) {
        const rule = choices[t.id];
        if (rule) await resolveCarryOver(t.id, rule);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.boardWeeks });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingCarryOver });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      onDone();
    },
  });

  const choose = (id: number, rule: CarryOverRule) =>
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
              <div
                className="flex overflow-hidden rounded-md border border-border text-xs"
                role="group"
              >
                {(
                  [
                    ["carry", CARRY_OVER_CARRY_LABEL],
                    ["return", CARRY_OVER_RETURN_LABEL],
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
              </div>
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
            {CARRY_OVER_DISMISS_LABEL}
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
