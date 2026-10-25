import { render, screen } from "@testing-library/react";

import { DEFAULT_CATEGORY_COLOR } from "@/api/categories";
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

// A stored color distinct from the default so the tests can tell "stored"
// and "unset" categories apart on the accent.
const WORK = { title: "Work", color: "#60A5FA" };
const HEALTH = { title: "Health", color: "#FBBF24" };
const DARK_CUSTOM_COLOR = "#000000";

// jsdom serializes hex colors to rgb() in style attributes.
const rgbOf = (hex: string) =>
  [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
    .join(", ");
const WORK_COLOR_RGB = rgbOf(WORK.color);
const HEALTH_COLOR_RGB = rgbOf(HEALTH.color);
const DEFAULT_COLOR_RGB = rgbOf(DEFAULT_CATEGORY_COLOR);

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
      <TaskCard
        task={task}
        categories={[category(1, WORK.title, WORK.color)]}
      />,
    );
    expect(screen.getByText(task.title)).toBeInTheDocument();
    expect(
      screen.getByText(formatMinutes(task.estimated_minutes!)),
    ).toBeInTheDocument();
    expect(screen.getByText(WORK.title)).toBeInTheDocument();
    expect(accent()).toHaveStyle({ background: WORK.color });
  });

  it("renders a gradient accent for multiple colored categories", () => {
    render(
      <TaskCard
        task={task}
        categories={[
          category(1, WORK.title, WORK.color),
          category(2, HEALTH.title, HEALTH.color),
        ]}
      />,
    );
    const style = accent().getAttribute("style")!;
    expect(style).toContain("linear-gradient");
    expect(style).toContain(WORK_COLOR_RGB);
    expect(style).toContain(HEALTH_COLOR_RGB);
  });

  it("paints the default accent for a category without a stored color", () => {
    render(
      <TaskCard task={task} categories={[category(1, WORK.title, null)]} />,
    );
    expect(accent()).toHaveStyle({ background: DEFAULT_CATEGORY_COLOR });
    const chip = screen.getByText(WORK.title);
    expect(chip.firstElementChild).toHaveStyle({
      backgroundColor: DEFAULT_CATEGORY_COLOR,
    });
  });

  it("includes the default color in the gradient for mixed stored and uncolored categories", () => {
    render(
      <TaskCard
        task={task}
        categories={[
          category(1, WORK.title, null),
          category(2, HEALTH.title, HEALTH.color),
        ]}
      />,
    );
    const style = accent().getAttribute("style")!;
    expect(style).toContain("linear-gradient");
    expect(style).toContain(DEFAULT_COLOR_RGB);
    expect(style).toContain(HEALTH_COLOR_RGB);
  });

  it("keeps the category name legible for dark custom colors", () => {
    render(
      <TaskCard
        task={task}
        categories={[category(1, WORK.title, DARK_CUSTOM_COLOR)]}
      />,
    );
    const chip = screen.getByText(WORK.title);
    expect(chip).toHaveClass("text-text");
    expect(chip.firstElementChild).toHaveStyle({
      backgroundColor: DARK_CUSTOM_COLOR,
    });
  });

  it("omits the estimate line when none is set", () => {
    render(
      <TaskCard task={{ ...task, estimated_minutes: null }} categories={[]} />,
    );
    expect(screen.queryByText(/\d+h|\d+m/)).not.toBeInTheDocument();
  });
});
