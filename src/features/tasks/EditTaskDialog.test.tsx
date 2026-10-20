import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import {
  addTaskCategory,
  createCategory,
  type Category,
  listCategories,
  listTaskCategories,
  removeTaskCategory,
} from "@/api/categories";
import { MAX_TASK_TITLE_LENGTH, updateTask } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { QUERY_KEYS } from "@/api/queryKeys";
import { EditTaskDialog } from "@/features/tasks/EditTaskDialog";
import {
  SPENT_RANGE_MESSAGE,
  TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
} from "@/lib/errors";
import {
  CANCEL_BUTTON_LABEL,
  CLOSE_LABEL,
  EDIT_BUTTON_LABEL,
  EDIT_TASK_HEADING,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  REPEAT_ENDS_BEFORE_START_MESSAGE,
  REPEAT_ENDS_LABEL,
  REPEAT_SECTION_LABEL,
  REPEAT_UNIT_OPTIONS,
  NOTES_TAB_INSTANCE_LABEL,
  NOTES_TAB_SERIES_LABEL,
  NOTES_EMPTY_MESSAGE,
  SAVE_BUTTON_LABEL,
  SCHEDULED_INSTANCE_PENDING_MESSAGE,
  SPENT_HOURS_LABEL,
  SPENT_MINUTES_LABEL,
  STATUS_LABELS,
  TITLE_REQUIRED_MESSAGE,
  formatMinutes,
  auditTimestampsLabel,
  describeRecurrence,
  seriesAuditLabel,
  TASK_SCOPE_COMING_SOON_HINT,
  TASK_SCOPE_FUTURE_LABEL,
  TASK_SCOPE_GROUP_LABEL,
  TASK_SCOPE_INSTANCE_LABEL,
  TASK_SCOPE_SERIES_LABEL,
  WEEKDAY_OPTIONS,
  createCategoryOptionLabel,
  removeTaskCategoryLabel,
} from "@/lib/labels";
import {
  listSeriesInstances,
  listTaskSeries,
  type TaskSeries,
} from "@/api/series";
import { formatDate } from "@/lib/utils";
import { categoryFixture } from "@/test/fixtures";
import { testQueryClient } from "@/test/queryClient";
import { MULTI_UNIT_EMOJI } from "@/test/unicode";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  updateTask: vi.fn(),
}));

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
  listTaskCategories: vi.fn(),
  addTaskCategory: vi.fn(),
  removeTaskCategory: vi.fn(),
  createCategory: vi.fn(),
}));

vi.mock("@/api/series", () => ({
  listTaskSeries: vi.fn(),
  listSeriesInstances: vi.fn(),
}));

const mockedListTaskSeries = vi.mocked(listTaskSeries);
const mockedListSeriesInstances = vi.mocked(listSeriesInstances);
const mockedUpdate = vi.mocked(updateTask);
const mockedListCategories = vi.mocked(listCategories);
const mockedListTaskCategories = vi.mocked(listTaskCategories);
const mockedAddTaskCategory = vi.mocked(addTaskCategory);
const mockedRemoveTaskCategory = vi.mocked(removeTaskCategory);
const mockedCreateCategory = vi.mocked(createCategory);

const TITLE_ORIGINAL = "Draft weekly reflection notes";
const TITLE_EDITED = "Review quarterly milestone planning";
const DESCRIPTION_EDITED = "Flag risks early";
const REPEAT_END_DATE = "2026-12-31";
// Mondays in Oct 2026 — the opened instance's date and a second persisted
// one the calendar tests pick.
const OPENED_INSTANCE_DATE = "2026-10-19";
const OTHER_INSTANCE_DATE = "2026-10-26";
const WEEKLY_UNIT = REPEAT_UNIT_OPTIONS.find((o) => o.value === "week")!;
const WEDNESDAY = WEEKDAY_OPTIONS.find((w) => w.value === "wednesday")!;

const baseTask: Task = {
  id: 7,
  profile_id: 1,
  title: TITLE_ORIGINAL,
  description: "old description",
  status: "todo",
  carry_over_rule: "carry",
  estimated_minutes: 90,
  spent_minutes: 30,
  placement: "backlog",
  scheduled_date: null,
  series_id: null,
  sort_order: 1,
  created_at: "2026-10-11 10:00:00",
  updated_at: "2026-10-12 09:00:00",
};

const baseSeries: TaskSeries = {
  id: 3,
  profile_id: 1,
  title: TITLE_ORIGINAL,
  description: null,
  carry_over_rule: "return",
  estimated_minutes: null,
  recurrence: {
    kind: "weekly",
    interval_weeks: 1,
    weekdays: ["monday"],
  },
  start_date: "2026-10-05",
  end_date: null,
  created_at: "2026-10-11 10:00:00",
  updated_at: "2026-10-11 10:00:00",
};

const renderDialog = (task: Task = baseTask, client = testQueryClient()) => {
  render(
    <QueryClientProvider client={client}>
      <EditTaskDialog task={task} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  // The dialog opens in read-only view mode; these tests exercise editing.
  fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON_LABEL }));
  return client;
};

const ERRANDS = categoryFixture();
const WORK = categoryFixture({ id: 2, title: "Work", color: "#fb923c" });

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe("EditTaskDialog", () => {
  beforeEach(() => {
    mockedUpdate.mockReset().mockResolvedValue(baseTask);
    mockedListCategories.mockReset().mockResolvedValue([ERRANDS, WORK]);
    mockedListTaskCategories.mockReset().mockResolvedValue([ERRANDS]);
    mockedAddTaskCategory.mockReset().mockResolvedValue(undefined);
    mockedRemoveTaskCategory.mockReset().mockResolvedValue(undefined);
    mockedListTaskSeries.mockReset().mockResolvedValue([baseSeries]);
    mockedListSeriesInstances.mockReset().mockResolvedValue([]);
  });

  it("pre-fills every editable field from the task", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveAccessibleName(EDIT_TASK_HEADING);
    expect(screen.getByLabelText(/Title/)).toHaveValue(TITLE_ORIGINAL);
    expect(screen.getByLabelText(/Description/)).toHaveValue(
      baseTask.description,
    );
    expect(screen.getByLabelText(ESTIMATED_HOURS_LABEL)).toHaveValue(1);
    expect(screen.getByLabelText(ESTIMATED_MINUTES_LABEL)).toHaveValue(30);
    expect(screen.getByLabelText(SPENT_HOURS_LABEL)).toHaveValue(0);
    expect(screen.getByLabelText(SPENT_MINUTES_LABEL)).toHaveValue(30);
    expect(
      screen.getByRole("radio", { name: STATUS_LABELS.todo }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Carry over" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows the read-only audit timestamps", () => {
    renderDialog();
    expect(
      screen.getByText(
        auditTimestampsLabel(
          formatDate(baseTask.created_at),
          formatDate(baseTask.updated_at),
        ),
      ),
    ).toBeInTheDocument();
  });

  it("submits the full update payload", async () => {
    mockedUpdate.mockResolvedValue(baseTask);
    renderDialog();

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: TITLE_EDITED },
    });
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: DESCRIPTION_EDITED },
    });
    fireEvent.change(screen.getByLabelText(SPENT_HOURS_LABEL), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("radio", { name: STATUS_LABELS.done }));
    fireEvent.click(screen.getByRole("radio", { name: "Return to backlog" }));
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(baseTask.id, {
        title: TITLE_EDITED,
        description: DESCRIPTION_EDITED,
        estimated_minutes: 90,
        spent_minutes: 150,
        carry_over_rule: "return",
        status: "done",
        series: null,
      }),
    );
  });

  it("clears description and durations when emptied", async () => {
    mockedUpdate.mockResolvedValue(baseTask);
    renderDialog();

    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByLabelText(ESTIMATED_HOURS_LABEL), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText(ESTIMATED_MINUTES_LABEL), {
      target: { value: "" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(baseTask.id, {
        title: TITLE_ORIGINAL,
        description: null,
        estimated_minutes: null,
        spent_minutes: 30,
        carry_over_rule: "carry",
        status: "todo",
        series: null,
      }),
    );
  });

  it("blocks an out-of-range spent time without calling the backend", async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(SPENT_HOURS_LABEL), {
      target: { value: "25" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      SPENT_RANGE_MESSAGE,
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("blocks an empty title without calling the backend", async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "   " },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      TITLE_REQUIRED_MESSAGE,
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("blocks control characters without calling the backend", async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: `${TITLE_EDITED}` },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("accepts a title past the UTF-16 length but within the char bound", async () => {
    mockedUpdate.mockResolvedValue(baseTask);
    renderDialog();
    const EMOJI_TITLE = MULTI_UNIT_EMOJI.repeat(
      Math.floor(MAX_TASK_TITLE_LENGTH / 2) + 1,
    );

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: EMOJI_TITLE },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        baseTask.id,
        expect.objectContaining({ title: EMOJI_TITLE }),
      ),
    );
  });

  it("trims U+0085 like the backend before validating", async () => {
    mockedUpdate.mockResolvedValue(baseTask);
    renderDialog();
    const NEL_PADDED = `\u0085${TITLE_EDITED}\u0085`;

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: NEL_PADDED },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        baseTask.id,
        expect.objectContaining({ title: TITLE_EDITED }),
      ),
    );
  });

  it("surfaces a mapped server error", async () => {
    const { ApiError } = await import("@/api/transport");
    mockedUpdate.mockRejectedValue(
      new ApiError("task_not_found", "validation", "task does not exist"),
    );
    renderDialog();

    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "task does not exist",
    );
  });

  it("closes on cancel", () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={baseTask} onClose={onClose} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: CANCEL_BUTTON_LABEL }));
    expect(onClose).toHaveBeenCalled();
  });

  it("opens in a read-only view of the task", async () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={baseTask} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(TITLE_ORIGINAL);
    expect(screen.getByText(baseTask.description!)).toBeInTheDocument();
    expect(
      await screen.findByText(STATUS_LABELS[baseTask.status]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatMinutes(baseTask.estimated_minutes!)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatMinutes(baseTask.spent_minutes!)),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: EDIT_BUTTON_LABEL }),
    ).toBeInTheDocument();
    // No form at all: a stray submit cannot save anything.
    expect(dialog.querySelector("form")).toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("closes from view mode", () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={baseTask} onClose={onClose} />
      </QueryClientProvider>,
    );
    // Two "Close" controls exist (header X + footer button) — both close.
    const [footerClose] = screen
      .getAllByRole("button", { name: CLOSE_LABEL })
      .slice(-1);
    fireEvent.click(footerClose);
    expect(onClose).toHaveBeenCalled();
  });

  it("pre-selects the task's current categories", async () => {
    renderDialog();
    expect(
      await screen.findByRole("button", {
        name: removeTaskCategoryLabel(ERRANDS.title),
      }),
    ).toBeInTheDocument();
  });

  it("merges a pick made before the stored categories resolve", async () => {
    const pending = deferred<Category[]>();
    mockedListTaskCategories.mockReturnValue(pending.promise);
    renderDialog();
    // Pick Work while the stored associations are still in flight.
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Work/ }));
    pending.resolve([ERRANDS]);
    // Both must be selected: the stored Errands and the early Work pick.
    await screen.findByRole("button", {
      name: removeTaskCategoryLabel(ERRANDS.title),
    });
    expect(
      screen.getByRole("button", { name: removeTaskCategoryLabel(WORK.title) }),
    ).toBeInTheDocument();
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() => {
      expect(mockedAddTaskCategory).toHaveBeenCalledWith(baseTask.id, WORK.id);
    });
    expect(mockedRemoveTaskCategory).not.toHaveBeenCalled();
  });

  it("still refreshes the task list when a category association fails", async () => {
    mockedAddTaskCategory.mockRejectedValue(new Error("join failed"));
    const client = testQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(
      <QueryClientProvider client={client}>
        <EditTaskDialog task={baseTask} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON_LABEL }));
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Work/ }));
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: QUERY_KEYS.tasks,
      }),
    );
    expect(mockedUpdate).toHaveBeenCalled();
  });

  it("persists a quick-created category on save", async () => {
    const CREATED = categoryFixture({ id: 3, title: "Gardening" });
    mockedCreateCategory.mockResolvedValue(CREATED);
    renderDialog();
    await screen.findByRole("button", {
      name: removeTaskCategoryLabel(ERRANDS.title),
    });
    const combobox = screen.getByRole("combobox");
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: CREATED.title } });
    fireEvent.mouseDown(
      screen.getByRole("option", {
        name: new RegExp(createCategoryOptionLabel(CREATED.title)),
      }),
    );
    await screen.findByRole("button", {
      name: removeTaskCategoryLabel(CREATED.title),
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() =>
      expect(mockedAddTaskCategory).toHaveBeenCalledWith(
        baseTask.id,
        CREATED.id,
      ),
    );
  });

  it("shows freshly fetched associations after a refetch", async () => {
    // The seeded selection must not freeze on the first resolved value —
    // a stale cache would otherwise hide an association added since.
    const CREATED = categoryFixture({ id: 3, title: "Gardening" });
    mockedListTaskCategories.mockResolvedValue([]);
    const client = renderDialog();
    // Let the initial fetch settle so the invalidation below is a real
    // refetch rather than racing the in-flight first request.
    await act(async () => {});
    mockedListTaskCategories.mockResolvedValue([CREATED]);
    await act(async () => {
      await client.invalidateQueries({
        queryKey: QUERY_KEYS.taskCategories(baseTask.id),
      });
    });
    expect(
      await screen.findByRole("button", {
        name: removeTaskCategoryLabel(CREATED.title),
      }),
    ).toBeInTheDocument();
  });

  it("shows a recolored category after the association list refetches", async () => {
    const client = renderDialog();
    await screen.findByRole("button", {
      name: removeTaskCategoryLabel(ERRANDS.title),
    });
    const recolored = { ...ERRANDS, color: "#f87171" };
    mockedListTaskCategories.mockResolvedValue([recolored]);
    await act(async () => {
      await client.invalidateQueries({
        queryKey: QUERY_KEYS.taskCategories(baseTask.id),
      });
    });
    await waitFor(() =>
      expect(screen.getByText(ERRANDS.title)).toHaveStyle({
        color: "rgb(248, 113, 113)",
      }),
    );
  });

  it("saves category changes as an add/remove diff", async () => {
    renderDialog();
    // Wait for the current associations to load, then swap Errands for Work.
    fireEvent.click(
      await screen.findByRole("button", {
        name: removeTaskCategoryLabel(ERRANDS.title),
      }),
    );
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Work/ }));
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() => {
      expect(mockedAddTaskCategory).toHaveBeenCalledWith(baseTask.id, WORK.id);
      expect(mockedRemoveTaskCategory).toHaveBeenCalledWith(
        baseTask.id,
        ERRANDS.id,
      );
    });
  });

  it("attaches a schedule when the repeat section is expanded", async () => {
    renderDialog();
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) }),
    );
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    expect(mockedUpdate.mock.calls[0][1].series).toMatchObject({
      recurrence: { kind: "daily", interval_days: 1 },
      end_date: null,
    });
  });

  it("sends the configured weekly schedule on the wire", async () => {
    renderDialog();
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) }),
    );
    fireEvent.click(screen.getByRole("button", { name: WEEKLY_UNIT.label }));
    fireEvent.click(screen.getByRole("button", { name: WEDNESDAY.label }));
    fireEvent.change(screen.getByLabelText(REPEAT_ENDS_LABEL), {
      target: { value: REPEAT_END_DATE },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    expect(mockedUpdate.mock.calls[0][1].series).toMatchObject({
      recurrence: {
        kind: "weekly",
        interval_weeks: 1,
        weekdays: expect.arrayContaining([WEDNESDAY.value]),
      },
      end_date: REPEAT_END_DATE,
    });
  });

  it("blocks saving while the schedule is invalid", async () => {
    renderDialog();
    // Let the stored-category query settle before asserting on the form.
    await screen.findByRole("button", {
      name: removeTaskCategoryLabel(ERRANDS.title),
    });
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) }),
    );
    const ends = screen.getByLabelText(REPEAT_ENDS_LABEL);
    fireEvent.change(ends, { target: { value: "2020-01-01" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      REPEAT_ENDS_BEFORE_START_MESSAGE,
    );
    // Save is disabled while the schedule is invalid — the submit button is
    // the gate here, so a synthetic form submit would bypass it.
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("clears the schedule when the repeat section is collapsed again", async () => {
    renderDialog();
    const toggle = screen.getByRole("button", {
      name: new RegExp(REPEAT_SECTION_LABEL),
    });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText(REPEAT_ENDS_LABEL), {
      target: { value: REPEAT_END_DATE },
    });
    fireEvent.click(toggle);
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    expect(mockedUpdate.mock.calls[0][1].series).toBeNull();
  });

  it("surfaces an already_in_series rejection from the backend", async () => {
    const { ApiError } = await import("@/api/transport");
    const ALREADY_IN_SERIES_MESSAGE = "the task already repeats";
    mockedUpdate.mockRejectedValue(
      new ApiError(
        "already_in_series",
        "validation",
        ALREADY_IN_SERIES_MESSAGE,
      ),
    );
    renderDialog();
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) }),
    );
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      ALREADY_IN_SERIES_MESSAGE,
    );
  });

  it("hides the repeat section for a task already in a series", () => {
    renderDialog({ ...baseTask, series_id: 3 });
    expect(
      screen.queryByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) }),
    ).not.toBeInTheDocument();
  });

  it("shows the series audit line in view mode", async () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{ ...baseTask, series_id: baseSeries.id }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        seriesAuditLabel(
          describeRecurrence(baseSeries.recurrence),
          formatDate(baseSeries.created_at),
        ),
      ),
    ).toBeInTheDocument();
  });

  it("shows the save-scope group in edit mode with series options disabled", async () => {
    renderDialog({ ...baseTask, series_id: baseSeries.id });

    const group = await screen.findByRole("group", {
      name: TASK_SCOPE_GROUP_LABEL,
    });
    const instance = screen.getByRole("radio", {
      name: TASK_SCOPE_INSTANCE_LABEL,
    });
    const series = screen.getByRole("radio", {
      name: TASK_SCOPE_SERIES_LABEL,
    });
    const future = screen.getByRole("radio", {
      name: TASK_SCOPE_FUTURE_LABEL,
    });
    expect(group).toContainElement(instance);
    expect(instance).toBeChecked();
    expect(series).toBeDisabled();
    expect(future).toBeDisabled();
    expect(screen.getAllByText(TASK_SCOPE_COMING_SOON_HINT)).toHaveLength(2);
  });

  it("hides the save-scope group for a task not in a series", () => {
    renderDialog();
    expect(
      screen.queryByRole("group", { name: TASK_SCOPE_GROUP_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("shows the instance calendar and notes tabs for a series task", async () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{
            ...baseTask,
            series_id: baseSeries.id,
            scheduled_date: OPENED_INSTANCE_DATE,
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // The calendar anchors on the viewed instance's month (Oct 2026).
    expect(await screen.findByText(/October 2026/)).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: NOTES_TAB_INSTANCE_LABEL }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(screen.getByRole("tabpanel")).getByText(NOTES_EMPTY_MESSAGE),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: NOTES_TAB_SERIES_LABEL }));
    expect(
      screen.getByRole("tab", { name: NOTES_TAB_SERIES_LABEL }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("shows the pending state for a scheduled date without an instance", async () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{
            ...baseTask,
            series_id: baseSeries.id,
            scheduled_date: OPENED_INSTANCE_DATE,
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // Mondays in Oct 2026: 5, 12, 19, 26 — 26 has no persisted instance.
    fireEvent.click(
      await screen.findByRole("button", { name: OTHER_INSTANCE_DATE }),
    );
    expect(
      await screen.findByText(SCHEDULED_INSTANCE_PENDING_MESSAGE),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: EDIT_BUTTON_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("loads a persisted instance when its date is picked", async () => {
    const other = {
      ...baseTask,
      id: 42,
      description: "the other occurrence",
      series_id: baseSeries.id,
      scheduled_date: OTHER_INSTANCE_DATE,
    };
    mockedListSeriesInstances.mockResolvedValue([other]);
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{
            ...baseTask,
            series_id: baseSeries.id,
            scheduled_date: OPENED_INSTANCE_DATE,
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: OTHER_INSTANCE_DATE }),
    );
    expect(await screen.findByText(other.description)).toBeInTheDocument();
    // Edit only applies to the opened task — it hides while viewing another
    // instance so it can't silently edit the wrong row.
    expect(
      screen.queryByRole("button", { name: EDIT_BUTTON_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("shows the selected instance's title in the heading", async () => {
    const other = {
      ...baseTask,
      id: 42,
      title: TITLE_EDITED,
      series_id: baseSeries.id,
      scheduled_date: OTHER_INSTANCE_DATE,
    };
    mockedListSeriesInstances.mockResolvedValue([other]);
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{
            ...baseTask,
            series_id: baseSeries.id,
            scheduled_date: OPENED_INSTANCE_DATE,
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("dialog", { name: TITLE_ORIGINAL }),
    ).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: OTHER_INSTANCE_DATE }),
    );
    expect(
      await screen.findByRole("dialog", { name: TITLE_EDITED }),
    ).toBeInTheDocument();
  });

  it("moves focus into the dialog when it opens in view mode", () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={baseTask} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("a series instance still updates its fields with no schedule on the wire", async () => {
    renderDialog({ ...baseTask, series_id: 3 });
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: TITLE_EDITED },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        baseTask.id,
        expect.objectContaining({ title: TITLE_EDITED, series: null }),
      ),
    );
  });
});
