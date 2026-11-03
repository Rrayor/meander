import { DndContext } from "@dnd-kit/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/api/bindings";
import { TaskPlacement, TaskStatus } from "@/lib/enums";
import { editTaskLabel } from "@/lib/labels";

import { BoardCard } from "./BoardCard";

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

const renderCard = (onOpen = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DndContext>
        <BoardCard task={TASK} onOpen={onOpen} />
      </DndContext>
    </QueryClientProvider>,
  );

describe("BoardCard", () => {
  it("renders the titled edit button and routes activation", () => {
    const onOpen = vi.fn();
    renderCard(onOpen);
    fireEvent.click(
      screen.getByRole("button", { name: editTaskLabel(TASK.title) }),
    );
    expect(onOpen).toHaveBeenCalled();
  });
});
