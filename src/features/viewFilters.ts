import type { Task } from "@/api/bindings";
import { TaskSort } from "@/lib/enums";

/// Search, filtering and sorting are view-time transforms (spec
/// §360–§366) — they never mutate stored order. Search matches
/// title, description and category titles; the sort keys cover the
/// spec's properties; "manual order" is the backlog's own stored
/// order and just yields the list as it came.
export const matchesSearch = (task: Task, query: string) => {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return (
    task.title.toLowerCase().includes(q) ||
    (task.description ?? "").toLowerCase().includes(q)
  );
};

const byTitle = (a: Task, b: Task) => a.title.localeCompare(b.title);

export const sortTasks = (tasks: Task[], sort: TaskSort): Task[] => {
  if (sort === TaskSort.Manual) return tasks;
  const copy = [...tasks];
  switch (sort) {
    case TaskSort.Title:
      return copy.sort(byTitle);
    case TaskSort.Created:
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case TaskSort.Updated:
      return copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    default:
      return copy;
  }
};
