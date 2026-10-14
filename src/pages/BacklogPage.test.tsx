import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { listTasks, moveTask } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { BacklogPage } from "@/pages/BacklogPage";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  listTasks: vi.fn(),
  moveTask: vi.fn(),
  createTask: vi.fn(),
}));

// jsdom reports zero-sized rects, so dnd-kit's closestCenter can never
// resolve a droppable. Stub it to report the collision the test sets up;
// the real drag pipeline (sensors, onDragEnd, mutation) still runs.
let draggedOver: number | null = null;
vi.mock("@dnd-kit/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dnd-kit/core")>()),
  closestCenter: () => (draggedOver == null ? [] : [{ id: draggedOver }]),
}));

const task = (over: Partial<Task>): Task => ({
  id: 1,
  profile_id: 1,
  title: "Task",
  description: null,
  status: "todo",
  carry_over_rule: null,
  estimated_minutes: null,
  spent_minutes: null,
  placement: "backlog",
  scheduled_date: null,
  sort_order: 0,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...over,
});

const renderPage = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <BacklogPage />
    </QueryClientProvider>,
  );

describe("BacklogPage", () => {
  it("shows the empty state when there are no tasks", async () => {
    vi.mocked(listTasks).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
  });

  it("renders tasks with status labels and formatted estimates", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: "Short", estimated_minutes: 45 }),
      task({
        id: 2,
        title: "Hour",
        estimated_minutes: 60,
        status: "in_progress",
      }),
      task({ id: 3, title: "Long", estimated_minutes: 90, status: "done" }),
      task({ id: 4, title: "No estimate" }),
    ]);
    renderPage();
    expect(await screen.findByText("Short")).toBeInTheDocument();
    expect(screen.getByText("45m")).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
    expect(screen.getAllByText("Todo")).toHaveLength(2);
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder Long" }),
    ).toBeInTheDocument();
  });

  it("surfaces a load error", async () => {
    vi.mocked(listTasks).mockRejectedValue(new Error("db offline"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("db offline");
  });

  it("reorders a task via the keyboard sensor and calls moveTask", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: "A", sort_order: 1 }),
      task({ id: 2, title: "B", sort_order: 2 }),
      task({ id: 3, title: "C", sort_order: 3 }),
    ]);
    vi.mocked(moveTask).mockResolvedValue(undefined);
    draggedOver = 2;
    renderPage();
    const reorder = await screen.findByRole("button", { name: "Reorder A" });

    reorder.focus();
    fireEvent.keyDown(reorder, { code: "Space" });
    // The keyboard sensor binds its move/end listeners in a setTimeout.
    await new Promise((resolve) => setTimeout(resolve));
    fireEvent.keyDown(document, { code: "ArrowDown" });
    fireEvent.keyDown(document, { code: "Space" });

    // A moved below B: neighbours are B before and C after.
    await waitFor(() =>
      expect(vi.mocked(moveTask)).toHaveBeenCalledWith(1, 2, 3),
    );
    // The settled mutation re-fetches the backlog.
    await waitFor(() =>
      expect(vi.mocked(listTasks).mock.calls.length).toBeGreaterThan(1),
    );
  });

  it("passes null anchors when a task lands at an edge", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: "A", sort_order: 1 }),
      task({ id: 2, title: "B", sort_order: 2 }),
    ]);
    vi.mocked(moveTask).mockResolvedValue(undefined);
    draggedOver = 1;
    renderPage();
    const reorder = await screen.findByRole("button", { name: "Reorder B" });

    reorder.focus();
    fireEvent.keyDown(reorder, { code: "Space" });
    // The keyboard sensor binds its move/end listeners in a setTimeout.
    await new Promise((resolve) => setTimeout(resolve));
    fireEvent.keyDown(document, { code: "ArrowUp" });
    fireEvent.keyDown(document, { code: "Space" });

    // B moved above A: no task before it.
    await waitFor(() =>
      expect(vi.mocked(moveTask)).toHaveBeenCalledWith(2, null, 1),
    );
  });

  it("opens the new-task dialog", async () => {
    vi.mocked(listTasks).mockResolvedValue([]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
