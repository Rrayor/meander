import { DndContext } from "@dnd-kit/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/api/bindings";
import { TaskPlacement, TaskSort, TaskStatus } from "@/lib/enums";
import { editTaskLabel } from "@/lib/labels";

import { WeekColumns } from "./WeekColumns";

const TASK: Task = {
  id: 1,
  profile_id: 1,
  title: "Card task",
  description: null,
  status: TaskStatus.Todo,
  carry_over_rule: null,
  estimated_minutes: 60,
  spent_minutes: 30,
  placement: TaskPlacement.WeeklyBacklog,
  scheduled_date: "2026-11-02",
  series_id: null,
  sort_order: 1,
  created_at: "2026-11-01 08:00:00",
  updated_at: "2026-11-01 08:00:00",
};

const renderColumns = (onOpenTask = vi.fn(), tasks: Task[] = [TASK]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DndContext>
        <table>
          <tbody>
            <WeekColumns
              columns={[null, TASK.scheduled_date]}
              transposed={false}
              tasks={tasks}
              query=""
              sort={TaskSort.Manual}
              threshold={undefined}
              taskCategories={new Map()}
              onOpenTask={onOpenTask}
            />
          </tbody>
        </table>
      </DndContext>
    </QueryClientProvider>,
  );

describe("WeekColumns", () => {
  it("renders a task card and routes the open action", () => {
    const onOpenTask = vi.fn();
    renderColumns(onOpenTask);
    fireEvent.click(
      screen.getByRole("button", { name: editTaskLabel(TASK.title) }),
    );
    expect(onOpenTask).toHaveBeenCalledWith(TASK);
  });
});
