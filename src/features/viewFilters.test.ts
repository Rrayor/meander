import { describe, expect, it } from "vitest";
import type { Task } from "@/api/bindings";
import { TaskSort } from "@/lib/enums";
import { matchesSearch, sortTasks } from "@/features/viewFilters";

const task = (id: number, patch: Partial<Task>): Task => ({
  id,
  profile_id: 1,
  title: `Task ${id}`,
  description: null,
  status: "todo",
  carry_over_rule: null,
  estimated_minutes: null,
  spent_minutes: null,
  placement: "backlog",
  scheduled_date: null,
  series_id: null,
  sort_order: id,
  created_at: `2026-10-0${id} 08:00:00`,
  updated_at: `2026-10-0${id} 08:00:00`,
  ...patch,
});

const tasks = [
  task(3, { title: "Gamma", description: "write tests" }),
  task(1, { title: "Alpha", updated_at: "2026-10-20 08:00:00" }),
  task(2, { title: "Beta" }),
];

describe("matchesSearch", () => {
  it("matches title and description case-insensitively", () => {
    expect(tasks.filter((t) => matchesSearch(t, "alpha")).length).toBe(1);
    expect(tasks.filter((t) => matchesSearch(t, "TESTS")).length).toBe(1);
    expect(tasks.filter((t) => matchesSearch(t, "")).length).toBe(3);
    expect(tasks.filter((t) => matchesSearch(t, "zzz")).length).toBe(0);
  });
});

describe("sortTasks", () => {
  it("manual order leaves the stored order untouched", () => {
    expect(sortTasks(tasks, TaskSort.Manual).map((t) => t.id)).toEqual([
      3, 1, 2,
    ]);
  });
  it("sorts by title, creation and update dates", () => {
    expect(sortTasks(tasks, TaskSort.Title)[0].title).toBe("Alpha");
    expect(sortTasks(tasks, TaskSort.Created)[0].id).toBe(1);
    expect(sortTasks(tasks, TaskSort.Updated)[0].id).toBe(1);
  });
});
