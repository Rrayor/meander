import {
  CarryOverRule,
  RecurrenceKind,
  RepeatUnit,
  TaskPlacement,
  TaskStatus,
  Weekday,
} from "@/lib/enums";
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
import {
  MAX_TASK_TITLE_LENGTH,
  deleteTask,
  returnTaskToBacklog,
  updateTask,
} from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { listSeriesNotes, listTaskNotes } from "@/api/notes";
import { QUERY_KEYS } from "@/api/queryKeys";
import { EditTaskDialog } from "@/features/tasks/EditTaskDialog";
import {
  INSTANCE_DATE_NOT_SCHEDULED_MESSAGE,
  SPENT_RANGE_MESSAGE,
  TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
} from "@/lib/errors";
import {
  CALENDAR_PREVIOUS_LABEL,
  CANCEL_BUTTON_LABEL,
  CARRY_OVER_OPTIONS,
  CLOSE_LABEL,
  DELETE_BUTTON_LABEL,
  MOVE_TO_BACKLOG_LABEL,
  DELETE_KEEP_LABEL,
  DELETE_SCOPE_FUTURE_LABEL,
  DELETE_TASK_HEADING,
  EDIT_BUTTON_LABEL,
  EDIT_TASK_HEADING,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  REPEAT_ENDS_BEFORE_START_MESSAGE,
  REPEAT_ENDS_ADD_LABEL,
  REPEAT_ENDS_LABEL,
  REPEAT_SECTION_LABEL,
  REPEAT_STARTS_LABEL,
  REPEAT_UNIT_OPTIONS,
  NOTES_TAB_INSTANCE_LABEL,
  NOTES_TAB_SERIES_LABEL,
  NOTES_EMPTY_MESSAGE,
  SAVE_BUTTON_LABEL,
  SCHEDULED_INSTANCE_PENDING_MESSAGE,
  INSTANCE_MATERIALIZING_MESSAGE,
  SPENT_HOURS_LABEL,
  SPENT_MINUTES_LABEL,
  STATUS_LABELS,
  TITLE_REQUIRED_MESSAGE,
  formatMinutes,
  auditTimestampsLabel,
  describeRecurrence,
  seriesAuditLabel,
  TASK_SCOPE_FUTURE_LABEL,
  TASK_SCOPE_GROUP_LABEL,
  TASK_SCOPE_INSTANCE_LABEL,
  TASK_SCOPE_SERIES_LABEL,
  WEEKDAY_OPTIONS,
  createCategoryOptionLabel,
  removeTaskCategoryLabel,
} from "@/lib/labels";
import {
  deleteTaskSeries,
  getOrCreateInstance,
  listSeriesCategories,
  listSeriesInstances,
  listTaskSeries,
  truncateTaskSeries,
  updateTaskSeries,
  updateTaskSeriesFrom,
  type TaskSeries,
} from "@/api/series";
import { formatDate, formatIsoDay } from "@/lib/utils";
import { categoryFixture } from "@/test/fixtures";
import { testQueryClient } from "@/test/queryClient";
import { MULTI_UNIT_EMOJI } from "@/test/unicode";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  returnTaskToBacklog: vi.fn(),
}));

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
  listTaskCategories: vi.fn(),
  addTaskCategory: vi.fn(),
  removeTaskCategory: vi.fn(),
  createCategory: vi.fn(),
}));

vi.mock("@/api/notes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/notes")>()),
  listTaskNotes: vi.fn(),
  listSeriesNotes: vi.fn(),
  createTaskNote: vi.fn(),
  createSeriesNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock("@/api/series", () => ({
  listTaskSeries: vi.fn(),
  listSeriesInstances: vi.fn(),
  listSeriesCategories: vi.fn(),
  updateTaskSeries: vi.fn(),
  updateTaskSeriesFrom: vi.fn(),
  deleteTaskSeries: vi.fn(),
  truncateTaskSeries: vi.fn(),
  getOrCreateInstance: vi.fn(),
}));

const mockedListTaskSeries = vi.mocked(listTaskSeries);
const mockedListSeriesInstances = vi.mocked(listSeriesInstances);
const mockedListSeriesCategories = vi.mocked(listSeriesCategories);
const mockedUpdateSeries = vi.mocked(updateTaskSeries);
const mockedUpdateSeriesFrom = vi.mocked(updateTaskSeriesFrom);
const mockedDeleteSeries = vi.mocked(deleteTaskSeries);
const mockedTruncateSeries = vi.mocked(truncateTaskSeries);
const mockedGetOrCreate = vi.mocked(getOrCreateInstance);
const mockedDeleteTask = vi.mocked(deleteTask);
const mockedReturnToBacklog = vi.mocked(returnTaskToBacklog);
const mockedUpdate = vi.mocked(updateTask);
const mockedListCategories = vi.mocked(listCategories);
const mockedListTaskCategories = vi.mocked(listTaskCategories);
const mockedAddTaskCategory = vi.mocked(addTaskCategory);
const mockedRemoveTaskCategory = vi.mocked(removeTaskCategory);
const mockedCreateCategory = vi.mocked(createCategory);
const mockedListTaskNotes = vi.mocked(listTaskNotes);
const mockedListSeriesNotes = vi.mocked(listSeriesNotes);

const TITLE_ORIGINAL = "Draft weekly reflection notes";
const TITLE_EDITED = "Review quarterly milestone planning";
const DESCRIPTION_EDITED = "Flag risks early";
const REPEAT_END_DATE = "2026-12-31";
// Mondays in Oct 2026 — the opened instance's date and a second persisted
// one the calendar tests pick.
const OPENED_INSTANCE_DATE = "2026-10-19";
const OTHER_INSTANCE_DATE = "2026-10-26";
// The Monday before the opened date — always in the past.
const PAST_INSTANCE_DATE = "2026-10-12";
// A scheduled-looking date that stays in the future — a near-future
// constant would age into the past.
const FUTURE_INSTANCE_DATE = "2036-01-07";
const WEEKLY_UNIT = REPEAT_UNIT_OPTIONS.find(
  (o) => o.value === RepeatUnit.Week,
)!;
const WEDNESDAY = WEEKDAY_OPTIONS.find((w) => w.value === Weekday.Wednesday)!;
const RETURN_OPTION = CARRY_OVER_OPTIONS.find(
  (o) => o.value === CarryOverRule.Return,
)!;

const LOAD_ERROR = "offline";

const baseTask: Task = {
  id: 7,
  profile_id: 1,
  title: TITLE_ORIGINAL,
  description: "old description",
  status: TaskStatus.Todo,
  carry_over_rule: CarryOverRule.Carry,
  estimated_minutes: 90,
  spent_minutes: 30,
  placement: TaskPlacement.Backlog,
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
  carry_over_rule: CarryOverRule.Return,
  estimated_minutes: null,
  recurrence: {
    kind: RecurrenceKind.Weekly,
    interval_weeks: 1,
    weekdays: [Weekday.Monday],
  },
  start_date: "2026-10-05",
  end_date: null,
  succeeded_by: null,
  created_at: "2026-10-11 10:00:00",
  updated_at: "2026-10-11 10:00:00",
};

const OLD_SERIES_TITLE = "old segment title";
const NEW_SERIES_TITLE = "living series title";

// A split series: the earlier segment owns Oct 5–25, the living one
// Oct 26 onward. Both share the weekly-Monday schedule.
const EARLIER_SEGMENT: TaskSeries = {
  ...baseSeries,
  id: 4,
  title: OLD_SERIES_TITLE,
  end_date: "2026-10-25",
  succeeded_by: baseSeries.id,
};
const LIVING_SERIES: TaskSeries = {
  ...baseSeries,
  title: NEW_SERIES_TITLE,
  start_date: "2026-10-26",
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
    mockedListSeriesCategories.mockReset().mockResolvedValue([WORK]);
    mockedUpdateSeries.mockReset().mockResolvedValue(baseSeries);
    mockedDeleteSeries.mockReset().mockResolvedValue(undefined);
    mockedTruncateSeries.mockReset().mockResolvedValue(undefined);
    // Default: materialization never resolves, keeping the pending panel —
    // tests that exercise the swap override per-case.
    mockedGetOrCreate.mockReset().mockReturnValue(new Promise<Task>(() => {}));
    mockedDeleteTask.mockReset().mockResolvedValue(undefined);
    mockedListTaskNotes.mockReset().mockResolvedValue([]);
    mockedListSeriesNotes.mockReset().mockResolvedValue([]);
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
    fireEvent.click(screen.getByRole("radio", { name: RETURN_OPTION.label }));
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(baseTask.id, {
        title: TITLE_EDITED,
        description: DESCRIPTION_EDITED,
        estimated_minutes: 90,
        spent_minutes: 150,
        carry_over_rule: CarryOverRule.Return,
        status: TaskStatus.Done,
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
        carry_over_rule: CarryOverRule.Carry,
        status: TaskStatus.Todo,
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
    // No task form at all: a stray submit cannot save anything. The only
    // forms allowed in the view are the notes composer/editor — notes are
    // handled outside the task form per spec.
    for (const form of Array.from(dialog.querySelectorAll("form"))) {
      expect(
        form.querySelector("textarea")?.getAttribute("aria-label"),
      ).toMatch(/note/i);
    }
    expect(screen.queryByLabelText(/Title/)).not.toBeInTheDocument();
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
    const RECOLORED = "#f87171";
    const RECOLORED_RGB = "rgb(248, 113, 113)";
    const client = renderDialog();
    await screen.findByRole("button", {
      name: removeTaskCategoryLabel(ERRANDS.title),
    });
    const recolored = { ...ERRANDS, color: RECOLORED };
    mockedListTaskCategories.mockResolvedValue([recolored]);
    await act(async () => {
      await client.invalidateQueries({
        queryKey: QUERY_KEYS.taskCategories(baseTask.id),
      });
    });
    // The name keeps the theme foreground — the recolor lands on the
    // chip's dot.
    await waitFor(() =>
      expect(screen.getByText(ERRANDS.title).querySelector("span")).toHaveStyle(
        { backgroundColor: RECOLORED_RGB },
      ),
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
      recurrence: { kind: RecurrenceKind.Daily, interval_days: 1 },
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
    fireEvent.click(screen.getByText(REPEAT_ENDS_ADD_LABEL));
    fireEvent.change(screen.getByLabelText(REPEAT_ENDS_LABEL), {
      target: { value: REPEAT_END_DATE },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    expect(mockedUpdate.mock.calls[0][1].series).toMatchObject({
      recurrence: {
        kind: RecurrenceKind.Weekly,
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
    fireEvent.click(screen.getByText(REPEAT_ENDS_ADD_LABEL));
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
    fireEvent.click(screen.getByText(REPEAT_ENDS_ADD_LABEL));
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
          formatIsoDay(baseSeries.start_date),
          null,
          formatDate(baseSeries.created_at),
          formatDate(baseSeries.updated_at),
        ),
      ),
    ).toBeInTheDocument();
  });

  it("shows the end date in the audit line when the series has one", async () => {
    const endedSeries = { ...baseSeries, end_date: REPEAT_END_DATE };
    mockedListTaskSeries.mockResolvedValue([endedSeries]);
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{ ...baseTask, series_id: endedSeries.id }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        seriesAuditLabel(
          describeRecurrence(endedSeries.recurrence),
          formatIsoDay(endedSeries.start_date),
          formatIsoDay(endedSeries.end_date!),
          formatDate(endedSeries.created_at),
          formatDate(endedSeries.updated_at),
        ),
      ),
    ).toBeInTheDocument();
  });

  it("shows the save-scope group in edit mode with every scope enabled", async () => {
    renderDialog({
      ...baseTask,
      series_id: baseSeries.id,
      scheduled_date: FUTURE_INSTANCE_DATE,
    });

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
    expect(series).toBeEnabled();
    // Future scope needs a viewed date to anchor the split (#30).
    expect(future).toBeEnabled();
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
      await within(screen.getByRole("tabpanel")).findByText(
        NOTES_EMPTY_MESSAGE,
      ),
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
    // Picking it shows the pending panel only — viewing alone must not
    // write; the Edit click is what materializes the row.
    fireEvent.click(
      await screen.findByRole("button", { name: OTHER_INSTANCE_DATE }),
    );
    expect(
      await screen.findByText(SCHEDULED_INSTANCE_PENDING_MESSAGE),
    ).toBeInTheDocument();
    expect(mockedGetOrCreate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON_LABEL }));
    expect(
      await screen.findByText(INSTANCE_MATERIALIZING_MESSAGE),
    ).toBeInTheDocument();
    expect(mockedGetOrCreate).toHaveBeenCalledWith(
      baseSeries.id,
      OTHER_INSTANCE_DATE,
    );
  });

  it("swaps to the materialized instance once it is created", async () => {
    const created = {
      ...baseTask,
      id: 42,
      description: "fresh occurrence",
      series_id: baseSeries.id,
      scheduled_date: OTHER_INSTANCE_DATE,
    };
    mockedGetOrCreate.mockResolvedValue(created);
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
    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    // Edit intent on a future date materializes straight into edit mode.
    await screen.findByRole("textbox", { name: /title/i });
    expect(await screen.findByDisplayValue(created.title)).toBeInTheDocument();
  });

  it("shows the earlier segment's values on a pending pre-cutoff date", async () => {
    mockedListTaskSeries.mockResolvedValue([LIVING_SERIES, EARLIER_SEGMENT]);
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{
            ...baseTask,
            series_id: EARLIER_SEGMENT.id,
            scheduled_date: OPENED_INSTANCE_DATE,
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // Oct 19 is before the Oct 26 cutoff — the earlier segment's title
    // shows, and materializing it targets the segment, not the living row.
    fireEvent.click(
      await screen.findByRole("button", { name: OPENED_INSTANCE_DATE }),
    );
    expect(
      await screen.findByText(SCHEDULED_INSTANCE_PENDING_MESSAGE),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: OLD_SERIES_TITLE }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON_LABEL }));
    await screen.findByText(INSTANCE_MATERIALIZING_MESSAGE);
    expect(mockedGetOrCreate).toHaveBeenCalledWith(
      EARLIER_SEGMENT.id,
      OPENED_INSTANCE_DATE,
    );
  });

  it("shows the living series' values on a pending post-cutoff date", async () => {
    mockedListTaskSeries.mockResolvedValue([LIVING_SERIES, EARLIER_SEGMENT]);
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{
            ...baseTask,
            series_id: EARLIER_SEGMENT.id,
            scheduled_date: OPENED_INSTANCE_DATE,
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // Oct 26 is the cutoff — the living series produces it.
    fireEvent.click(
      await screen.findByRole("button", { name: OTHER_INSTANCE_DATE }),
    );
    expect(
      await screen.findByText(SCHEDULED_INSTANCE_PENDING_MESSAGE),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: NEW_SERIES_TITLE }),
    ).toBeInTheDocument();
  });

  it("keeps the pending panel and surfaces a typed materialize error", async () => {
    const { ApiError } = await import("@/api/transport");
    mockedGetOrCreate.mockRejectedValue(
      new ApiError(
        "instance_date_not_scheduled",
        "validation",
        "deliberately different backend message",
      ),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      INSTANCE_DATE_NOT_SCHEDULED_MESSAGE,
    );
    expect(
      screen.getByText(SCHEDULED_INSTANCE_PENDING_MESSAGE),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: EDIT_BUTTON_LABEL }),
    ).toBeInTheDocument();
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
    // A future instance is editable — Edit now applies to the viewed row.
    expect(
      screen.getByRole("button", { name: EDIT_BUTTON_LABEL }),
    ).toBeInTheDocument();
  });

  it("keeps a picked past instance editable alongside its notes", async () => {
    const past = {
      ...baseTask,
      id: 41,
      description: "last week's occurrence",
      series_id: baseSeries.id,
      scheduled_date: PAST_INSTANCE_DATE,
    };
    mockedListSeriesInstances.mockResolvedValue([past]);
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
      await screen.findByRole("button", { name: past.scheduled_date! }),
    );
    expect(await screen.findByText(past.description)).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: NOTES_TAB_INSTANCE_LABEL }),
    ).toBeInTheDocument();
    // Spec §232: past instances are editable like any other.
    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    const instance = screen.getByRole("radio", {
      name: TASK_SCOPE_INSTANCE_LABEL,
    });
    expect(instance).toBeEnabled();
    expect(instance).toBeChecked();
  });

  it("edits a past-dated opened instance at instance scope", async () => {
    // The backlog anchor of an older series — its scheduled_date is the
    // original start, already past.
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{
            ...baseTask,
            series_id: baseSeries.id,
            scheduled_date: PAST_INSTANCE_DATE,
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    expect(
      screen.getByRole("radio", { name: TASK_SCOPE_INSTANCE_LABEL }),
    ).toBeChecked();

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: TITLE_EDITED },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        baseTask.id,
        expect.objectContaining({ title: TITLE_EDITED }),
      ),
    );
    expect(mockedUpdateSeries).not.toHaveBeenCalled();
  });

  it("edits a past-dated task without a series", async () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{ ...baseTask, scheduled_date: PAST_INSTANCE_DATE }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: EDIT_BUTTON_LABEL }),
    );
    expect(screen.getByLabelText(/Title/)).toHaveValue(TITLE_ORIGINAL);
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

  it("does not render the calendar until the instances query resolves", async () => {
    const gate = deferred<Task[]>();
    mockedListSeriesInstances.mockReturnValue(gate.promise);
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

    await screen.findByRole("dialog", { name: TITLE_ORIGINAL });
    // A clickable calendar that doesn't know its persisted dates yet would
    // mark a persisted instance pending — it must stay out until the data
    // arrives.
    expect(
      screen.queryByRole("button", { name: CALENDAR_PREVIOUS_LABEL }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: OPENED_INSTANCE_DATE }),
    ).not.toBeInTheDocument();

    await act(async () => gate.resolve([]));
    expect(
      await screen.findByRole("button", { name: CALENDAR_PREVIOUS_LABEL }),
    ).toBeInTheDocument();
  });

  it("shows no series UI for a task without a series", () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={baseTask} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: CALENDAR_PREVIOUS_LABEL }),
    ).not.toBeInTheDocument();
    // The queries must not even fire — series_id is null.
    expect(mockedListTaskSeries).not.toHaveBeenCalled();
    expect(mockedListSeriesInstances).not.toHaveBeenCalled();
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

  it("applies a series-scope save to the whole series", async () => {
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );

    // The stored schedule seeds the series edit; status and spent stay
    // per-instance so their controls are disabled.
    expect(await screen.findByLabelText(REPEAT_STARTS_LABEL)).toHaveValue(
      baseSeries.start_date,
    );
    expect(
      screen.getByRole("radio", { name: STATUS_LABELS.todo }),
    ).toBeDisabled();
    expect(screen.getByLabelText(SPENT_HOURS_LABEL)).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: TITLE_EDITED },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    // Series categories (WORK) replace the instance's (ERRANDS) on save,
    // and the untouched shared fields submit the series' values — the
    // instance's description/carry-over/estimate are per-instance overrides
    // that must not be promoted.
    await waitFor(() =>
      expect(mockedUpdateSeries).toHaveBeenCalledWith(baseSeries.id, {
        title: TITLE_EDITED,
        description: baseSeries.description,
        carry_over_rule: baseSeries.carry_over_rule,
        estimated_minutes: baseSeries.estimated_minutes,
        recurrence: baseSeries.recurrence,
        start_date: baseSeries.start_date,
        end_date: baseSeries.end_date,
        category_ids: [WORK.id],
      }),
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("applies a this-and-future save by splitting at the viewed date", async () => {
    renderDialog({
      ...baseTask,
      series_id: baseSeries.id,
      scheduled_date: FUTURE_INSTANCE_DATE,
    });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_FUTURE_LABEL }),
    );

    // Same series treatment as the whole-series scope — except Starts,
    // which is locked to the viewed date the split anchors on.
    const starts = await screen.findByLabelText(REPEAT_STARTS_LABEL);
    expect(starts).toHaveValue(FUTURE_INSTANCE_DATE);
    expect(starts).toHaveAttribute("readonly");
    expect(
      screen.getByRole("radio", { name: STATUS_LABELS.todo }),
    ).toBeDisabled();
    expect(screen.getByLabelText(SPENT_HOURS_LABEL)).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: TITLE_EDITED },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockedUpdateSeriesFrom).toHaveBeenCalledWith(
        baseSeries.id,
        FUTURE_INSTANCE_DATE,
        expect.objectContaining({ title: TITLE_EDITED }),
      ),
    );
    expect(mockedUpdateSeries).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("blocks the future save while a split is in flight", async () => {
    mockedUpdateSeriesFrom.mockReturnValue(new Promise(() => {}));
    renderDialog({
      ...baseTask,
      series_id: baseSeries.id,
      scheduled_date: FUTURE_INSTANCE_DATE,
    });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_FUTURE_LABEL }),
    );
    await screen.findByLabelText(REPEAT_STARTS_LABEL);
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );

    await waitFor(() => expect(mockedUpdateSeriesFrom).toHaveBeenCalled());
    // A retried submit would re-split against the already-moved id —
    // the pending mutation keeps Save disabled.
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
  });

  it("disables the future scope when the viewed instance has no date", async () => {
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    expect(
      screen.getByRole("radio", { name: TASK_SCOPE_FUTURE_LABEL }),
    ).toBeDisabled();
  });

  it("sends an edited schedule with the series-scope save", async () => {
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );
    fireEvent.click(await screen.findByText(REPEAT_ENDS_ADD_LABEL));
    fireEvent.change(await screen.findByLabelText(REPEAT_ENDS_LABEL), {
      target: { value: REPEAT_END_DATE },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() =>
      expect(mockedUpdateSeries).toHaveBeenCalledWith(
        baseSeries.id,
        expect.objectContaining({ end_date: REPEAT_END_DATE }),
      ),
    );
  });

  it("blocks the series save while the edited schedule is invalid", async () => {
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );
    fireEvent.click(await screen.findByText(REPEAT_ENDS_ADD_LABEL));
    const ends = await screen.findByLabelText(REPEAT_ENDS_LABEL);
    fireEvent.change(ends, { target: { value: "2020-01-01" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      REPEAT_ENDS_BEFORE_START_MESSAGE,
    );
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
    expect(mockedUpdateSeries).not.toHaveBeenCalled();
  });

  it("blocks the series save when the repeat section is collapsed", async () => {
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );
    await screen.findByLabelText(REPEAT_STARTS_LABEL);
    // Collapsing the section clears the schedule draft — a series without a
    // schedule cannot be saved.
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) }),
    );
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
    expect(mockedUpdateSeries).not.toHaveBeenCalled();
  });

  it("surfaces a failed series save", async () => {
    const { ApiError } = await import("@/api/transport");
    const SERIES_ERROR_MESSAGE = "the series is gone";
    mockedUpdateSeries.mockRejectedValue(
      new ApiError("series_not_found", "validation", SERIES_ERROR_MESSAGE),
    );
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );
    await screen.findByLabelText(REPEAT_STARTS_LABEL);
    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      SERIES_ERROR_MESSAGE,
    );
  });

  it("ends the series at a scheduled-but-unpersisted date", async () => {
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
    // Pick the scheduled-but-unpersisted Monday; its delete prompt can only
    // truncate — there is no instance to delete.
    fireEvent.click(
      await screen.findByRole("button", { name: OTHER_INSTANCE_DATE }),
    );
    fireEvent.click(screen.getByRole("button", { name: DELETE_BUTTON_LABEL }));
    expect(
      screen.queryByRole("radio", { name: TASK_SCOPE_INSTANCE_LABEL }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("radio", { name: DELETE_SCOPE_FUTURE_LABEL }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: DELETE_BUTTON_LABEL,
      })[1],
    );
    await waitFor(() =>
      expect(mockedTruncateSeries).toHaveBeenCalledWith(
        baseSeries.id,
        OTHER_INSTANCE_DATE,
      ),
    );
  });

  const SERIES_DESCRIPTION = "the shared series description";

  it("reseeds the shared fields from the series when series scope is picked", async () => {
    // The opened instance carries custom edits; a series save must not
    // promote them to every occurrence (spec §146 goes the other way).
    mockedListTaskSeries.mockResolvedValue([
      {
        ...baseSeries,
        title: TITLE_EDITED,
        description: SERIES_DESCRIPTION,
        estimated_minutes: 45,
        carry_over_rule: CarryOverRule.Return as const,
      },
    ]);
    renderDialog({ ...baseTask, series_id: baseSeries.id });

    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/Title/)).toHaveValue(TITLE_EDITED),
    );
    expect(screen.getByLabelText(/Description/)).toHaveValue(
      SERIES_DESCRIPTION,
    );
    expect(screen.getByLabelText(ESTIMATED_MINUTES_LABEL)).toHaveValue(45);
    expect(
      screen.getByRole("radio", { name: RETURN_OPTION.label }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("restores the instance's own values when scope switches back", async () => {
    // The series seed must not leak into the instance form — an instance
    // save after a scope round-trip sends the instance's values, not the
    // series' shared ones.
    mockedListTaskSeries.mockResolvedValue([
      { ...baseSeries, title: TITLE_EDITED, estimated_minutes: 45 },
    ]);
    renderDialog({ ...baseTask, series_id: baseSeries.id });

    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Title/)).toHaveValue(TITLE_EDITED),
    );
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_INSTANCE_LABEL }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/Title/)).toHaveValue(TITLE_ORIGINAL),
    );
    expect(screen.getByLabelText(/Description/)).toHaveValue(
      baseTask.description,
    );
    expect(screen.getByLabelText(ESTIMATED_MINUTES_LABEL)).toHaveValue(30);

    fireEvent.submit(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }).closest("form")!,
    );
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        baseTask.id,
        expect.objectContaining({ title: TITLE_ORIGINAL }),
      ),
    );
    expect(mockedUpdateSeries).not.toHaveBeenCalled();
  });

  it("keeps typed edits when the scope switches to the series", async () => {
    // The series seed fills only untouched fields — a title the user
    // typed while the instance scope was active must not be reset to the
    // series' stored value.
    mockedListTaskSeries.mockResolvedValue([
      { ...baseSeries, description: SERIES_DESCRIPTION },
    ]);
    renderDialog({ ...baseTask, series_id: baseSeries.id });

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: TITLE_EDITED },
    });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/Description/)).toHaveValue(
        SERIES_DESCRIPTION,
      ),
    );
    expect(screen.getByLabelText(/Title/)).toHaveValue(TITLE_EDITED);
  });

  it("keeps the shared fields disabled until the series row loads", async () => {
    // Typing before the seed lands would be lost to the reset — the fields
    // stay disabled until the row arrives.
    const pending = deferred<TaskSeries[]>();
    mockedListTaskSeries.mockReturnValue(pending.promise);
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );

    expect(screen.getByLabelText(/Title/)).toBeDisabled();
    expect(screen.getByLabelText(/Description/)).toBeDisabled();
    expect(screen.getByLabelText(ESTIMATED_MINUTES_LABEL)).toBeDisabled();

    pending.resolve([{ ...baseSeries, title: TITLE_EDITED }]);
    await waitFor(() =>
      expect(screen.getByLabelText(/Title/)).toHaveValue(TITLE_EDITED),
    );
    expect(screen.getByLabelText(/Title/)).toBeEnabled();
  });

  it("blocks a series save until the series categories finish loading", async () => {
    // Saving before the query resolves would submit an empty category set
    // and erase the stored associations.
    const pending = deferred<Category[]>();
    mockedListSeriesCategories.mockReturnValue(pending.promise);
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );
    await screen.findByLabelText(REPEAT_STARTS_LABEL);

    const save = screen.getByRole("button", { name: SAVE_BUTTON_LABEL });
    expect(save).toBeDisabled();

    pending.resolve([WORK]);
    await waitFor(() => expect(save).toBeEnabled());
  });

  it("blocks and surfaces a failed series-category load", async () => {
    mockedListSeriesCategories.mockRejectedValue(new Error(LOAD_ERROR));
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );
    await screen.findByLabelText(REPEAT_STARTS_LABEL);

    expect(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent(LOAD_ERROR);
  });

  it("does not let an invalid spent draft block a series save", async () => {
    // Spent is instance-only: at series scope its inputs are disabled, and
    // reseeding restores the task's valid values — a stale draft error must
    // not keep Save disabled for a submit that doesn't even send spent.
    renderDialog({ ...baseTask, series_id: baseSeries.id });
    const spent = screen.getByLabelText(SPENT_HOURS_LABEL);
    fireEvent.change(spent, { target: { value: "99" } });
    fireEvent.blur(spent);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      SPENT_RANGE_MESSAGE,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );
    await screen.findByLabelText(REPEAT_STARTS_LABEL);

    const save = screen.getByRole("button", { name: SAVE_BUTTON_LABEL });
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.queryByText(SPENT_RANGE_MESSAGE)).not.toBeInTheDocument();

    fireEvent.submit(save.closest("form")!);
    await waitFor(() => expect(mockedUpdateSeries).toHaveBeenCalled());
    expect(mockedUpdateSeries.mock.calls[0][1]).not.toHaveProperty(
      "spent_minutes",
    );
  });

  it("deletes the viewed instance after confirmation", async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={baseTask} onClose={onClose} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: DELETE_BUTTON_LABEL }));
    expect(
      screen.getByRole("heading", { name: DELETE_TASK_HEADING }),
    ).toBeInTheDocument();
    // A non-series task has no scope prompt — just the warning.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: DELETE_BUTTON_LABEL,
      })[1],
    );
    await waitFor(() =>
      expect(mockedDeleteTask).toHaveBeenCalledWith(baseTask.id),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("deletes the whole series when that scope is chosen", async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog
          task={{ ...baseTask, series_id: baseSeries.id }}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: DELETE_BUTTON_LABEL }));
    fireEvent.click(
      screen.getByRole("radio", { name: TASK_SCOPE_SERIES_LABEL }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: DELETE_BUTTON_LABEL,
      })[1],
    );
    await waitFor(() =>
      expect(mockedDeleteSeries).toHaveBeenCalledWith(baseSeries.id),
    );
    expect(mockedDeleteTask).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("ends the series at the viewed date for the future scope", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: DELETE_BUTTON_LABEL }));
    fireEvent.click(
      screen.getByRole("radio", { name: DELETE_SCOPE_FUTURE_LABEL }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: DELETE_BUTTON_LABEL,
      })[1],
    );
    await waitFor(() =>
      expect(mockedTruncateSeries).toHaveBeenCalledWith(
        baseSeries.id,
        OPENED_INSTANCE_DATE,
      ),
    );
    expect(mockedDeleteSeries).not.toHaveBeenCalled();
  });

  it("keeps the task when the delete prompt is dismissed", () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={baseTask} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: DELETE_BUTTON_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: DELETE_KEEP_LABEL }));
    expect(
      screen.queryByRole("heading", { name: DELETE_TASK_HEADING }),
    ).not.toBeInTheDocument();
    expect(mockedDeleteTask).not.toHaveBeenCalled();
  });

  it("moves a board task back to the backlog from the details view", async () => {
    const onWeek = { ...baseTask, placement: TaskPlacement.WeeklyBacklog };
    mockedReturnToBacklog.mockResolvedValue(onWeek);
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={onWeek} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: MOVE_TO_BACKLOG_LABEL }),
    );

    await waitFor(() =>
      expect(mockedReturnToBacklog).toHaveBeenCalledWith(onWeek.id),
    );
  });

  it("offers move-to-backlog on a day-scheduled card too", async () => {
    const scheduled = {
      ...baseTask,
      placement: TaskPlacement.Scheduled,
      scheduled_date: "2026-10-30",
    };
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={scheduled} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole("button", { name: MOVE_TO_BACKLOG_LABEL }),
    ).toBeInTheDocument();
  });

  it("surfaces a failed move to the backlog", async () => {
    const onWeek = { ...baseTask, placement: TaskPlacement.WeeklyBacklog };
    mockedReturnToBacklog.mockRejectedValue(new Error(LOAD_ERROR));
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={onWeek} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: MOVE_TO_BACKLOG_LABEL }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(LOAD_ERROR);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("hides the move-to-backlog action for a task already in the backlog", async () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <EditTaskDialog task={baseTask} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: DELETE_BUTTON_LABEL });
    expect(
      screen.queryByRole("button", { name: MOVE_TO_BACKLOG_LABEL }),
    ).not.toBeInTheDocument();
  });
});
