import { render, screen } from "@testing-library/react";

import type { Category, Task } from "@/api/bindings";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TASK_CARD_LABEL, formatMinutes } from "@/lib/labels";

const task: Task = {
  id: 1,
  profile_id: 1,
  title: "Refactor pooling",
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

const category = (
  id: number,
  title: string,
  color: string | null,
): Category => ({
  id,
  profile_id: 1,
  title,
  description: null,
  color,
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-01 08:00:00",
});

const accent = () =>
  screen.getByRole("article", { name: TASK_CARD_LABEL(task.title) })
    .firstElementChild!;

describe("TaskCard", () => {
  it("shows title, formatted estimate, and a solid accent for one category", () => {
    render(
      <TaskCard task={task} categories={[category(1, "Work", "#2DD4BF")]} />,
    );
    expect(screen.getByText(task.title)).toBeInTheDocument();
    expect(
      screen.getByText(formatMinutes(task.estimated_minutes!)),
    ).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(accent()).toHaveStyle({ background: "#2DD4BF" });
  });

  it("renders a gradient accent for multiple colored categories", () => {
    render(
      <TaskCard
        task={task}
        categories={[
          category(1, "Work", "#2DD4BF"),
          category(2, "Health", "#FBBF24"),
        ]}
      />,
    );
    expect(accent().getAttribute("style")).toContain("linear-gradient");
    expect(accent().getAttribute("style")).toContain("251, 191, 36");
  });

  it("omits the accent when categories have no colors", () => {
    render(<TaskCard task={task} categories={[category(1, "Work", null)]} />);
    expect(accent()).not.toHaveAttribute("style");
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("omits the estimate line when none is set", () => {
    render(
      <TaskCard task={{ ...task, estimated_minutes: null }} categories={[]} />,
    );
    expect(screen.queryByText(/\d+h|\d+m/)).not.toBeInTheDocument();
  });
});
