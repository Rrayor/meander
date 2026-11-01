import { TaskPlacement, TaskSort, TaskStatus } from "@/lib/enums";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { currentProfile, listProfiles, switchProfile } from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import { addTaskToWeek, deleteTask, listTasks, moveTask } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { ProfileSwitcher } from "@/layout/ProfileSwitcher";
import { BacklogPage } from "@/pages/BacklogPage";
import {
  ADD_TASK_LABEL,
  CANCEL_BUTTON_LABEL,
  EDIT_BUTTON_LABEL,
  EDIT_TASK_HEADING,
  EMPTY_BACKLOG_MESSAGE,
  SEARCH_TASKS_LABEL,
  SORT_TASKS_LABEL,
  TASK_SORT_LABELS,
  PAGINATION_NEXT_LABEL,
  PAGINATION_PREVIOUS_LABEL,
  STATUS_LABELS,
  addToWeekLabel,
  editTaskLabel,
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
  addTaskToWeek: vi.fn(),
}));

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  currentProfile: vi.fn().mockResolvedValue(null),
  listProfiles: vi.fn(),
  switchProfile: vi.fn(),
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
  status: TaskStatus.Todo,
  carry_over_rule: null,
  estimated_minutes: null,
  spent_minutes: null,
  placement: TaskPlacement.Backlog,
  scheduled_date: null,
  series_id: null,
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
const MOVE_ERROR = "move rejected";
const PROFILE_DATE = "2026-01-01";
const FIRST_PROFILE: Profile = {
  id: 1,
  name: "Default",
  created_at: PROFILE_DATE,
  updated_at: PROFILE_DATE,
};
const SECOND_PROFILE: Profile = { ...FIRST_PROFILE, id: 2, name: "Work" };
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
        status: TaskStatus.InProgress,
      }),
      task({
        id: 3,
        title: TITLE_LONG,
        estimated_minutes: 90,
        status: TaskStatus.Done,
      }),
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

  it("shows only the anchor row of a series, not its instances", async () => {
    // Persisted later instances belong to the series — the backlog lists
    // one entry per series, not every materialized row.
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, series_id: 7 }),
      task({ id: 2, title: TITLE_B, series_id: 7 }),
      task({ id: 3, title: TITLE_C }),
    ]);
    renderPage();
    expect(await screen.findByText(TITLE_A)).toBeInTheDocument();
    expect(screen.queryByText(TITLE_B)).not.toBeInTheDocument();
    expect(screen.getByText(TITLE_C)).toBeInTheDocument();
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

  it("surfaces a failed reorder in an alert", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
      task({ id: 2, title: TITLE_B, sort_order: 2 }),
    ]);
    vi.mocked(moveTask).mockRejectedValue(new Error(MOVE_ERROR));
    draggedOver = 2;
    renderPage();
    const reorder = await screen.findByRole("button", {
      name: reorderLabel(TITLE_A),
    });

    reorder.focus();
    fireEvent.keyDown(reorder, { code: KEY_SPACE });
    await new Promise((resolve) => setTimeout(resolve));
    fireEvent.keyDown(document, { code: "ArrowDown" });
    fireEvent.keyDown(document, { code: KEY_SPACE });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(MOVE_ERROR),
    );
  });

  it("keeps a reorder error raised before the first profile response", async () => {
    // The profile query is still in flight when the reorder fails — its
    // first resolution must not clear the alert (only a switch may).
    let resolveProfile: (p: Profile) => void = () => {};
    vi.mocked(currentProfile)
      .mockReset()
      .mockImplementation(
        () => new Promise<Profile>((r) => (resolveProfile = r)),
      );
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
      task({ id: 2, title: TITLE_B, sort_order: 2 }),
    ]);
    vi.mocked(moveTask).mockRejectedValue(new Error(MOVE_ERROR));
    draggedOver = 2;
    renderPage();
    const reorder = await screen.findByRole("button", {
      name: reorderLabel(TITLE_A),
    });

    reorder.focus();
    fireEvent.keyDown(reorder, { code: KEY_SPACE });
    await new Promise((resolve) => setTimeout(resolve));
    fireEvent.keyDown(document, { code: "ArrowDown" });
    fireEvent.keyDown(document, { code: KEY_SPACE });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(MOVE_ERROR),
    );

    resolveProfile(FIRST_PROFILE);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(MOVE_ERROR),
    );
  });

  it("an open task editor does not survive a profile switch", async () => {
    vi.mocked(listTasks)
      .mockResolvedValueOnce([task({ id: 1, title: TITLE_A, sort_order: 1 })])
      .mockResolvedValue([task({ id: 2, title: TITLE_B, sort_order: 1 })]);
    vi.mocked(listProfiles).mockResolvedValue([FIRST_PROFILE, SECOND_PROFILE]);
    vi.mocked(currentProfile)
      .mockReset()
      .mockResolvedValueOnce(FIRST_PROFILE)
      .mockResolvedValue(SECOND_PROFILE);
    vi.mocked(switchProfile).mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={testQueryClient()}>
        <BacklogPage />
        <ProfileSwitcher />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByText(TITLE_A));
    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    expect(
      await screen.findByRole("heading", { name: EDIT_TASK_HEADING }),
    ).toBeInTheDocument();

    // The open dialog is a modal — the page behind it is inert, so the
    // switcher is reached through the hidden-elements query. The switch
    // still fires: real users can't reach it, but the regression guard
    // covers the programmatic path.
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(FIRST_PROFILE.name),
        hidden: true,
      }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: SECOND_PROFILE.name,
        hidden: true,
      }),
    );

    await waitFor(() => expect(screen.getByText(TITLE_B)).toBeInTheDocument());
    expect(
      screen.queryByRole("heading", { name: EDIT_TASK_HEADING }),
    ).not.toBeInTheDocument();
  });

  it("an editor opened from the new list survives the delayed profile load", async () => {
    // Post-switch race: the tasks query can resolve before
    // currentProfile. An editor opened for a new-profile row belongs to
    // that profile — the switch handler must not close it when the
    // delayed response lands.
    let resolveProfile: (p: Profile) => void = () => {};
    vi.mocked(currentProfile)
      .mockReset()
      .mockResolvedValueOnce(FIRST_PROFILE)
      .mockImplementation(
        () => new Promise<Profile>((r) => (resolveProfile = r)),
      );
    vi.mocked(listTasks)
      .mockResolvedValueOnce([task({ id: 1, title: TITLE_A, sort_order: 1 })])
      .mockResolvedValue([
        task({
          id: 2,
          profile_id: SECOND_PROFILE.id,
          title: TITLE_B,
          sort_order: 1,
        }),
      ]);
    vi.mocked(listProfiles).mockResolvedValue([FIRST_PROFILE, SECOND_PROFILE]);
    vi.mocked(switchProfile).mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={testQueryClient()}>
        <BacklogPage />
        <ProfileSwitcher />
      </QueryClientProvider>,
    );
    await screen.findByText(TITLE_A);

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(FIRST_PROFILE.name) }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: SECOND_PROFILE.name }),
    );

    // The new list renders while currentProfile is still pending.
    fireEvent.click(await screen.findByText(TITLE_B));
    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    expect(
      await screen.findByRole("heading", { name: EDIT_TASK_HEADING }),
    ).toBeInTheDocument();

    resolveProfile(SECOND_PROFILE);

    // Give the effect a beat to run, then confirm the editor stayed open.
    await new Promise((r) => setTimeout(r));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: EDIT_TASK_HEADING }),
      ).toBeInTheDocument(),
    );
  });

  it("a reorder failure from the old profile does not follow the switch", async () => {
    vi.mocked(listTasks)
      .mockResolvedValueOnce([
        task({ id: 1, title: TITLE_A, sort_order: 1 }),
        task({ id: 2, title: TITLE_B, sort_order: 2 }),
      ])
      .mockResolvedValue([task({ id: 2, title: TITLE_B, sort_order: 1 })]);
    vi.mocked(moveTask).mockRejectedValue(new Error(MOVE_ERROR));
    vi.mocked(listProfiles).mockResolvedValue([FIRST_PROFILE, SECOND_PROFILE]);
    vi.mocked(currentProfile)
      .mockReset()
      .mockResolvedValueOnce(FIRST_PROFILE)
      .mockResolvedValue(SECOND_PROFILE);
    vi.mocked(switchProfile).mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={testQueryClient()}>
        <BacklogPage />
        <ProfileSwitcher />
      </QueryClientProvider>,
    );
    const reorder = await screen.findByRole("button", {
      name: reorderLabel(TITLE_A),
    });
    draggedOver = 2;

    reorder.focus();
    fireEvent.keyDown(reorder, { code: KEY_SPACE });
    await new Promise((resolve) => setTimeout(resolve));
    fireEvent.keyDown(document, { code: "ArrowDown" });
    fireEvent.keyDown(document, { code: KEY_SPACE });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(MOVE_ERROR),
    );

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(FIRST_PROFILE.name) }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: SECOND_PROFILE.name }),
    );

    await waitFor(() => expect(screen.getByText(TITLE_B)).toBeInTheDocument());
    // The reset fires once the current-profile refetch lands — the tasks
    // query may win the race, so poll for the alert to disappear.
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
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

  it("adds a task to the current week via its row button and re-fetches", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
    ]);
    vi.mocked(addTaskToWeek).mockResolvedValue(
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
    );
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", {
        name: addToWeekLabel(TITLE_A),
      }),
    );

    await waitFor(() =>
      expect(vi.mocked(addTaskToWeek)).toHaveBeenCalledWith(
        1,
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(vi.mocked(listTasks).mock.calls.length).toBeGreaterThan(1),
    );
  });

  it("shows the add-to-week action without requiring hover", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
    ]);
    renderPage();
    expect(
      await screen.findByRole("button", { name: addToWeekLabel(TITLE_A) }),
    ).toBeVisible();
  });

  it("does not open the task when the add-to-week button is clicked", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
    ]);
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", {
        name: addToWeekLabel(TITLE_A),
      }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("surfaces an add-to-week error", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
    ]);
    vi.mocked(addTaskToWeek).mockRejectedValue(new Error(LOAD_ERROR_MESSAGE));
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", {
        name: addToWeekLabel(TITLE_A),
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      LOAD_ERROR_MESSAGE,
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

  it("paginates the backlog at 50 items per page", async () => {
    const many = Array.from({ length: 51 }, (_, i) =>
      task({ id: i + 1, title: `Task ${i + 1}`, sort_order: i + 1 }),
    );
    vi.mocked(listTasks).mockResolvedValue(many);
    renderPage();
    await screen.findByRole("button", { name: editTaskLabel("Task 1") });

    expect(
      screen.getByRole("button", { name: PAGINATION_NEXT_LABEL }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: editTaskLabel("Task 51") }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: PAGINATION_NEXT_LABEL }),
    );
    expect(
      await screen.findByRole("button", { name: editTaskLabel("Task 51") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: editTaskLabel("Task 1") }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: PAGINATION_PREVIOUS_LABEL }),
    );
    expect(
      await screen.findByRole("button", { name: editTaskLabel("Task 1") }),
    ).toBeInTheDocument();
  });

  it("hides pagination controls for a single page", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task({ id: 1, title: TITLE_A, sort_order: 1 }),
    ]);
    renderPage();
    await screen.findByRole("button", { name: editTaskLabel(TITLE_A) });
    expect(
      screen.queryByRole("button", { name: PAGINATION_NEXT_LABEL }),
    ).not.toBeInTheDocument();
  });
});

test("a search with no matches keeps the toolbar and shows the empty state", async () => {
  vi.mocked(listTasks).mockResolvedValue([
    task({ id: 1, title: TITLE_A, sort_order: 1 }),
  ]);
  renderPage();
  await screen.findByText(TITLE_A);

  const input = screen.getByRole("searchbox", {
    name: SEARCH_TASKS_LABEL,
  });
  fireEvent.change(input, { target: { value: "zzz-no-match" } });

  await waitFor(() =>
    expect(screen.getByText(EMPTY_BACKLOG_MESSAGE)).toBeInTheDocument(),
  );
  expect(screen.getByLabelText(SEARCH_TASKS_LABEL)).toBeInTheDocument();
});

test("a matching query narrows the list; the sort pick reorders it", async () => {
  vi.mocked(listTasks).mockResolvedValue([
    task({ id: 1, title: "Bravo", sort_order: 1 }),
    task({ id: 2, title: "Alpha", sort_order: 2 }),
  ]);
  renderPage();
  await screen.findByText("Bravo");
  const search = screen.getByLabelText(SEARCH_TASKS_LABEL);
  fireEvent.change(search, { target: { value: "alpha" } });
  await waitFor(() => {
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
  });

  fireEvent.change(search, { target: { value: "" } });
  // Base UI's select commits an item on pointerdown+click — see
  // Select.test.tsx; the portaled popup is queried off `screen`.
  fireEvent.click(screen.getByRole("combobox", { name: SORT_TASKS_LABEL }));
  const titleSort = await screen.findByRole("option", {
    name: TASK_SORT_LABELS[TaskSort.Title],
  });
  fireEvent.pointerDown(titleSort);
  fireEvent.click(titleSort);
  await waitFor(() => {
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("Alpha");
    expect(rows[1]).toContain("Bravo");
  });
});
