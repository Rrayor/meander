import { DEFAULT_CATEGORY_COLOR } from "@/api/categories";
import type { Category } from "@/api/categories";
import type { Task } from "@/api/bindings";
import { TaskCard } from "@/features/tasks/TaskCard";
import { BOARD_HEADING, BOARD_PREVIEW_NOTE } from "@/lib/labels";

// Placeholder cards until the real board lands (plan item 34) — a single
// example exercises the TaskCard markup against the design.
const exampleTask: Task = {
  id: 0,
  profile_id: 0,
  title: "Example task",
  description: null,
  status: "todo",
  carry_over_rule: null,
  estimated_minutes: 150,
  spent_minutes: null,
  placement: "backlog",
  scheduled_date: null,
  series_id: null,
  sort_order: 0,
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-01 08:00:00",
};
const exampleCategories: Category[] = [
  {
    id: 1,
    profile_id: 0,
    title: "Work",
    description: null,
    color: DEFAULT_CATEGORY_COLOR,
    created_at: "2026-10-01 08:00:00",
    updated_at: "2026-10-01 08:00:00",
  },
];

export function BoardPage() {
  return (
    <>
      <header className="flex items-center border-b border-border px-6 py-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          {BOARD_HEADING}
        </h1>
      </header>
      <section className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-72 flex-col gap-3">
          <TaskCard task={exampleTask} categories={exampleCategories} />
          <p className="text-sm text-text-muted">{BOARD_PREVIEW_NOTE}</p>
        </div>
      </section>
    </>
  );
}
