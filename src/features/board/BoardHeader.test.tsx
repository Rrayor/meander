import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Weekday } from "@/lib/enums";
import {
  ADD_TASK_LABEL,
  BOARD_NEXT_WEEK_LABEL,
  BOARD_THIS_WEEK_LABEL,
} from "@/lib/labels";

import { BoardHeader } from "./BoardHeader";
import { taskTotals } from "./boardGrid";

const WEEK = [
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
  "2026-11-08",
];

const PROPS = {
  week: WEEK,
  anchorIso: WEEK[0],
  weekStart: Weekday.Monday,
  totals: taskTotals([]),
};

describe("BoardHeader", () => {
  it("routes week navigation and add-task", () => {
    const onNavigate = vi.fn();
    const onAddTask = vi.fn();
    render(
      <BoardHeader
        {...PROPS}
        isCurrentWeek={false}
        onNavigate={onNavigate}
        onAddTask={onAddTask}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: BOARD_NEXT_WEEK_LABEL }),
    );
    expect(onNavigate).toHaveBeenCalledWith("2026-11-09");
    fireEvent.click(screen.getByRole("button", { name: ADD_TASK_LABEL }));
    expect(onAddTask).toHaveBeenCalled();
  });

  it("disables This week while viewing the current week", () => {
    render(
      <BoardHeader
        {...PROPS}
        isCurrentWeek
        onNavigate={vi.fn()}
        onAddTask={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: BOARD_THIS_WEEK_LABEL }),
    ).toBeDisabled();
  });
});
