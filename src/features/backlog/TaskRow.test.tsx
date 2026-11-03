import { DndContext } from "@dnd-kit/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/api/tasks";
import { TaskPlacement, TaskStatus } from "@/lib/enums";
import {
  addToWeekLabel,
  deleteTaskLabel,
  editTaskLabel,
  formatMinutes,
} from "@/lib/labels";

import { TaskRow } from "./TaskRow";

const TASK: Task = {
  id: 1,
  profile_id: 1,
  title: "Row task",
  description: null,
  status: TaskStatus.Todo,
  carry_over_rule: null,
  estimated_minutes: 60,
  spent_minutes: null,
  placement: TaskPlacement.WeeklyBacklog,
  scheduled_date: null,
  series_id: null,
  sort_order: 1,
  created_at: "2026-11-01 08:00:00",
  updated_at: "2026-11-01 08:00:00",
};

const CALLBACKS = {
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onAddToWeek: vi.fn(),
};

const renderRow = (over: Partial<Parameters<typeof TaskRow>[0]> = {}) =>
  render(
    <DndContext>
      <ul>
        <TaskRow
          task={TASK}
          deletePending={false}
          sortLocked={false}
          {...CALLBACKS}
          {...over}
        />
      </ul>
    </DndContext>,
  );

describe("TaskRow", () => {
  it("routes title, add-to-week, and delete actions", () => {
    renderRow();
    fireEvent.click(
      screen.getByRole("button", { name: editTaskLabel(TASK.title) }),
    );
    expect(CALLBACKS.onEdit).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: addToWeekLabel(TASK.title) }),
    );
    expect(CALLBACKS.onAddToWeek).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: deleteTaskLabel(TASK.title) }),
    );
    expect(CALLBACKS.onDelete).toHaveBeenCalled();
  });

  it("shows the formatted estimate and disables delete while pending", () => {
    renderRow({ deletePending: true });
    expect(screen.getByText(formatMinutes(60))).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: deleteTaskLabel(TASK.title) }),
    ).toBeDisabled();
  });
});
