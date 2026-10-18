import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { deleteTask, listTasks, moveTask } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { BacklogPage } from "@/pages/BacklogPage";
import {
  ADD_TASK_LABEL,
  CANCEL_BUTTON_LABEL,
  EMPTY_BACKLOG_MESSAGE,
  STATUS_LABELS,
  deleteTaskLabel,
  formatMinutes,
  reorderLabel,
} from "@/lib/labels";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  listTasks: vi.fn(),
  moveTask: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  currentProfile: vi.fn().mockResolvedValue(null),
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

const TITLE_SHORT = "Short";
const TITLE_LONG = "Long";
const TITLE_A = "A";
const TITLE_B = "B";
const TITLE_C = "C";
const LOAD_ERROR_MESSAGE = "db offline";
const KEY_SPACE = "Space";

describe("BacklogPage", () => {
  it("shows the empty state when there are no tasks", async () => {
    vi.mocked(listTasks).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(EMPTY_BACKLOG_MESSAGE)).toBeInTheDocument();
  });

  it("renders tasks with status labels and formatted estimates", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_SHORT, estimated_minutes: 45 }),
      task({
        id: 2,
        title: "Hour",
        estimated_minutes: 60,
        status: "in_progress",
      }),
      task({ id: 3, title: TITLE_LONG, estimated_minutes: 90, status: "done" }),
      task({ id: 4, title: "No estimate" }),
    ]);
    renderPage();
    expect(await screen.findByText(TITLE_SHORT)).toBeInTheDocument();
    expect(screen.getByText(formatMinutes(45))).toBeInTheDocument();
    expect(screen.getByText(formatMinutes(60))).toBeInTheDocument();
    expect(screen.getByText(formatMinutes(90))).toBeInTheDocument();
    expect(screen.getAllByText(STATUS_LABELS.todo)).toHaveLength(2);
    expect(screen.getByText(STATUS_LABELS.in_progress)).toBeInTheDocument();
    expect(screen.getByText(STATUS_LABELS.done)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: reorderLabel(TITLE_LONG) }),
    ).toBeInTheDocument();
  });

  it("surfaces a load error", async () => {
    vi.mocked(listTasks).mockRejectedValue(new Error(LOAD_ERROR_MESSAGE));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      LOAD_ERROR_MESSAGE,
    );
  });

  it("reorders a task via the keyboard sensor and calls moveTask", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
      task({ id: 2, title: TITLE_B, sort_order: 2 }),
      task({ id: 3, title: TITLE_C, sort_order: 3 }),
    ]);
    vi.mocked(moveTask).mockResolvedValue(undefined);
    draggedOver = 2;
    renderPage();
    const reorder = await screen.findByRole("button", {
      name: reorderLabel(TITLE_A),
    });

    reorder.focus();
    fireEvent.keyDown(reorder, { code: KEY_SPACE });
    // The keyboard sensor binds its move/end listeners in a setTimeout.
    await new Promise((resolve) => setTimeout(resolve));
    fireEvent.keyDown(document, { code: "ArrowDown" });
    fireEvent.keyDown(document, { code: KEY_SPACE });

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
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
      task({ id: 2, title: TITLE_B, sort_order: 2 }),
    ]);
    vi.mocked(moveTask).mockResolvedValue(undefined);
    draggedOver = 1;
    renderPage();
    const reorder = await screen.findByRole("button", {
      name: reorderLabel(TITLE_B),
    });

    reorder.focus();
    fireEvent.keyDown(reorder, { code: KEY_SPACE });
    // The keyboard sensor binds its move/end listeners in a setTimeout.
    await new Promise((resolve) => setTimeout(resolve));
    fireEvent.keyDown(document, { code: "ArrowUp" });
    fireEvent.keyDown(document, { code: KEY_SPACE });

    // B moved above A: no task before it.
    await waitFor(() =>
      expect(vi.mocked(moveTask)).toHaveBeenCalledWith(2, null, 1),
    );
  });

  it("opens the new-task dialog", async () => {
    vi.mocked(listTasks).mockResolvedValue([]);
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: ADD_TASK_LABEL }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: CANCEL_BUTTON_LABEL }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the edit dialog when the row is clicked", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
    ]);
    renderPage();
    const row = (await screen.findByText(TITLE_A)).closest("li")!;

    fireEvent.click(row);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("deletes a task via its row button and re-fetches the list", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
      task({ id: 2, title: TITLE_B, sort_order: 2 }),
    ]);
    vi.mocked(deleteTask).mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: deleteTaskLabel(TITLE_A) }),
    );

    await waitFor(() =>
      expect(vi.mocked(deleteTask)).toHaveBeenCalledWith(1, expect.anything()),
    );
    await waitFor(() =>
      expect(vi.mocked(listTasks).mock.calls.length).toBeGreaterThan(1),
    );
  });

  it("surfaces a delete error", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
    ]);
    vi.mocked(deleteTask).mockRejectedValue(new Error(LOAD_ERROR_MESSAGE));
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: deleteTaskLabel(TITLE_A) }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      LOAD_ERROR_MESSAGE,
    );
  });
});
