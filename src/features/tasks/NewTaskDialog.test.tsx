import { CarryOverRule, RecurrenceKind } from "@/lib/enums";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  addTaskCategory,
  listCategories,
  removeTaskCategory,
} from "@/api/categories";
import {
  MAX_DURATION_MINUTES,
  MAX_TASK_TITLE_LENGTH,
  updateTask,
} from "@/api/tasks";
import { ApiError } from "@/api/transport";
import { createTask } from "@/api/tasks";
import { NewTaskDialog } from "@/features/tasks/NewTaskDialog";
import {
  SERVER_ERROR_MESSAGES,
  TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
  serverErrorMessage,
} from "@/lib/errors";
import {
  REPEAT_ENDS_ADD_LABEL,
  REPEAT_ENDS_BEFORE_START_MESSAGE,
  TITLE_REQUIRED_MESSAGE,
  removeTaskCategoryLabel,
} from "@/lib/labels";
import { todayLocalIso, weekdayOfIso } from "@/lib/utils";
import { categoryFixture } from "@/test/fixtures";
import { testQueryClient } from "@/test/queryClient";
import { MULTI_UNIT_EMOJI } from "@/test/unicode";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
  addTaskCategory: vi.fn(),
  removeTaskCategory: vi.fn(),
}));

const mockedCreate = vi.mocked(createTask);
const mockedListCategories = vi.mocked(listCategories);
const mockedAddTaskCategory = vi.mocked(addTaskCategory);
const mockedRemoveTaskCategory = vi.mocked(removeTaskCategory);
const mockedUpdate = vi.mocked(updateTask);

const renderDialog = (onClose = vi.fn()) => {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <NewTaskDialog onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
};

const VALID_TITLE = "Write tests";
const BACKEND_MESSAGE = "backend copy";
const LOAD_ERROR_MESSAGE = "db offline";

const fillTitle = (value = VALID_TITLE) =>
  fireEvent.change(screen.getByLabelText(/Title/), { target: { value } });

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));

const ERRANDS = categoryFixture();

const todayWeekday = () => weekdayOfIso(todayLocalIso());

describe("NewTaskDialog", () => {
  beforeEach(() => {
    mockedCreate.mockReset();
    mockedListCategories.mockReset().mockResolvedValue([ERRANDS]);
    mockedAddTaskCategory.mockReset().mockResolvedValue(undefined);
    mockedRemoveTaskCategory.mockReset().mockResolvedValue(undefined);
    mockedUpdate.mockReset().mockResolvedValue({} as never);
  });

  it("validates the title on blur before submit", async () => {
    renderDialog();
    const title = screen.getByLabelText(/Title/);
    fireEvent.focus(title);
    fireEvent.blur(title);
    expect(await screen.findByText(TITLE_REQUIRED_MESSAGE)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("shows the duration range error when hours exceed the maximum", async () => {
    renderDialog();
    const hours = screen.getByLabelText("Estimated hours");
    fireEvent.change(hours, { target: { value: "30" } });
    fireEvent.blur(hours);
    expect(
      await screen.findByText(
        SERVER_ERROR_MESSAGES.estimated_time_out_of_range as string,
      ),
    ).toBeInTheDocument();
  });

  it("submits the mapped payload including carry-over and closes", async () => {
    const onClose = renderDialog();
    mockedCreate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof createTask>>,
    );

    fillTitle();
    fireEvent.change(screen.getByLabelText("Estimated minutes"), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Carry over" }));
    submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    // mutationFn is invoked as fn(payload, mutationContext) — assert the payload
    expect(mockedCreate.mock.calls[0][0]).toEqual({
      title: VALID_TITLE,
      description: null,
      estimated_minutes: 90,
      carry_over_rule: CarryOverRule.Carry,
      series: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("defaults carry-over to null when Ask is selected", async () => {
    renderDialog();
    mockedCreate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof createTask>>,
    );
    fillTitle();
    submit();
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][0].carry_over_rule).toBeNull();
  });

  it("rejects control characters inline without calling the backend", async () => {
    renderDialog();

    fillTitle(`${VALID_TITLE}`);
    submit();

    expect(
      await screen.findByText(TASK_TITLE_INVALID_CHARACTERS_MESSAGE),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("accepts a title past the UTF-16 length but within the char bound", async () => {
    renderDialog();
    mockedCreate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof createTask>>,
    );
    // Emoji are 2 UTF-16 units each — the backend's len_char_max counts code
    // points, so the client schema must not cap them earlier.
    const EMOJI_TITLE = MULTI_UNIT_EMOJI.repeat(
      Math.floor(MAX_TASK_TITLE_LENGTH / 2) + 1,
    );

    fillTitle(EMOJI_TITLE);
    submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][0].title).toBe(EMOJI_TITLE);
  });

  it("trims U+0085 like the backend before validating", async () => {
    renderDialog();
    mockedCreate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof createTask>>,
    );
    // Rust's trim removes U+0085 (Unicode White_Space); JS trim does not —
    // the client must sanitize the same way so it doesn't reject valid input.
    const NEL_PADDED = `\u0085${VALID_TITLE}\u0085`;

    fillTitle(NEL_PADDED);
    submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][0].title).toBe(VALID_TITLE);
  });

  // The end-to-end server-error path (reject → React Query → inline alert →
  // dialog stays open) is covered by the Playwright suite — vitest flags the
  // mocked rejection as unhandled even though the mutation handles it.
  it("maps typed error codes to user-facing copy", () => {
    expect(SERVER_ERROR_MESSAGES.task_title_required).toBe(
      TITLE_REQUIRED_MESSAGE,
    );
    expect(SERVER_ERROR_MESSAGES.estimated_time_out_of_range).toContain(
      `${MAX_DURATION_MINUTES / 60} hours`,
    );
  });

  it("does not create a second task when a failed association is retried", async () => {
    mockedCreate.mockResolvedValue({ id: 42 } as never);
    mockedAddTaskCategory
      .mockRejectedValueOnce(new Error("flaky join"))
      .mockResolvedValue(undefined);
    renderDialog();
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Errands/ }));
    fillTitle();
    submit();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    submit();
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedAddTaskCategory).toHaveBeenCalledTimes(2);
  });

  it("a retry after a failed association persists revised details", async () => {
    mockedCreate.mockResolvedValue({ id: 42 } as never);
    mockedAddTaskCategory
      .mockRejectedValueOnce(new Error("flaky join"))
      .mockResolvedValue(undefined);
    renderDialog();
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Errands/ }));
    fillTitle();
    submit();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fillTitle("Renamed task");
    submit();
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ title: "Renamed task" }),
      ),
    );
  });

  it("a retry attaches a schedule configured after a failed association", async () => {
    mockedCreate.mockResolvedValue({ id: 42, series_id: null } as never);
    mockedAddTaskCategory
      .mockRejectedValueOnce(new Error("flaky join"))
      .mockResolvedValue(undefined);
    mockedUpdate.mockResolvedValue({ id: 42, series_id: 7 } as never);
    renderDialog();
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Errands/ }));
    fillTitle();
    submit();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // The task exists but stayed plain — a schedule picked now must still
    // reach the backend on retry instead of being silently dropped.
    fireEvent.click(screen.getByRole("button", { name: /Repeat/ }));
    fireEvent.click(screen.getByRole("button", { name: "weeks" }));
    submit();
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          series: expect.objectContaining({
            recurrence: expect.objectContaining({
              kind: RecurrenceKind.Weekly,
              interval_weeks: 1,
            }),
          }),
        }),
      ),
    );
  });

  it("hides the repeat controls once the retried task is linked", async () => {
    mockedCreate.mockResolvedValue({ id: 42, series_id: 7 } as never);
    mockedAddTaskCategory
      .mockRejectedValueOnce(new Error("flaky join"))
      .mockResolvedValue(undefined);
    renderDialog();
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Errands/ }));
    fillTitle();
    submit();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Created with a schedule: the section is gone, and the retry must not
    // re-send a series (the backend would reject already_in_series).
    expect(
      screen.queryByRole("button", { name: /Repeat/ }),
    ).not.toBeInTheDocument();
    submit();
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ series: null }),
      ),
    );
  });

  it("a retry removes an association the user unselected", async () => {
    const WORK = categoryFixture({ id: 2, title: "Work", color: "#fb923c" });
    mockedListCategories.mockResolvedValue([ERRANDS, WORK]);
    mockedCreate.mockResolvedValue({ id: 42 } as never);
    // Errands links fine; Work fails — leaving Errands already committed.
    mockedAddTaskCategory.mockImplementation((_taskId, categoryId) =>
      categoryId === WORK.id
        ? Promise.reject(new Error("flaky join"))
        : Promise.resolve(),
    );
    renderDialog();
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Errands/ }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Work/ }));
    fillTitle();
    submit();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Unselect Errands — its committed association must be removed on retry.
    fireEvent.click(
      screen.getByRole("button", {
        name: removeTaskCategoryLabel(ERRANDS.title),
      }),
    );
    submit();
    await waitFor(() =>
      expect(mockedRemoveTaskCategory).toHaveBeenCalledWith(42, ERRANDS.id),
    );
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });

  it("Escape closes only the open category dropdown, not the dialog", async () => {
    const onClose = renderDialog();
    fireEvent.focus(screen.getByRole("combobox"));
    await screen.findByRole("option", { name: /Errands/ });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("option", { name: /Errands/ }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("associates the picked categories after creating the task", async () => {
    mockedCreate.mockResolvedValue({ id: 42 } as never);
    renderDialog();
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Errands/ }));
    fillTitle();
    submit();
    await waitFor(() =>
      expect(mockedAddTaskCategory).toHaveBeenCalledWith(42, ERRANDS.id),
    );
  });

  it.each([
    [
      new ApiError("task_title_required", "validation", BACKEND_MESSAGE),
      "Task title is required",
    ],
    [
      new ApiError("profile_name_required", "validation", BACKEND_MESSAGE),
      BACKEND_MESSAGE,
    ],
    [new Error(LOAD_ERROR_MESSAGE), LOAD_ERROR_MESSAGE],
    ["string error", undefined],
    [undefined, undefined],
  ])("serverErrorMessage maps %j to %j", (error, expected) => {
    expect(serverErrorMessage(error)).toBe(expected);
  });

  it.each([
    [
      "Escape key",
      (onClose: ReturnType<typeof vi.fn>) => {
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
      },
    ],
    [
      "Cancel button",
      (onClose: ReturnType<typeof vi.fn>) => {
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onClose).toHaveBeenCalled();
      },
    ],
  ])("closes via %s without calling the backend", async (_, act) => {
    const onClose = renderDialog();
    act(onClose);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("disables Create while the repeat schedule is invalid", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Repeat/ }));
    fireEvent.click(screen.getByText(REPEAT_ENDS_ADD_LABEL));
    fireEvent.change(screen.getByLabelText(/Ends/), {
      target: { value: "2020-01-01" },
    });

    expect(
      await screen.findByText(REPEAT_ENDS_BEFORE_START_MESSAGE),
    ).toBeInTheDocument();
    // The disabled button is the gate — a synthetic form submit would bypass
    // it, so assert the state rather than firing submit.
    expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("re-enables Create once a schedule error is fixed", async () => {
    renderDialog();
    mockedCreate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof createTask>>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Repeat/ }));
    fireEvent.click(screen.getByText(REPEAT_ENDS_ADD_LABEL));
    const ends = screen.getByLabelText(/Ends/);
    fireEvent.change(ends, { target: { value: "2020-01-01" } });
    expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled();

    fireEvent.change(ends, { target: { value: "2027-01-01" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create task" })).toBeEnabled(),
    );
    fillTitle();
    submit();
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          series: expect.objectContaining({ end_date: "2027-01-01" }),
        }),
      ),
    );
  });

  it("sends series: null when the repeat section is collapsed again", async () => {
    renderDialog();
    mockedCreate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof createTask>>,
    );
    const toggle = screen.getByRole("button", { name: /Repeat/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fillTitle();
    submit();
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({ series: null }),
      ),
    );
  });

  it("a stale schedule error does not disable the retry once the task is linked", async () => {
    let resolveCreate!: (task: { id: number; series_id: number }) => void;
    mockedCreate.mockReturnValue(
      new Promise((r) => {
        resolveCreate = r;
      }) as never,
    );
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Repeat/ }));
    fillTitle();
    submit();
    // While the create is in flight the user breaks the schedule — the
    // section unmounts when the task links, and that stale error must not
    // keep the retry disabled.
    fireEvent.click(screen.getByText(REPEAT_ENDS_ADD_LABEL));
    fireEvent.change(screen.getByLabelText(/Ends/), {
      target: { value: "2020-01-01" },
    });
    await screen.findByText(REPEAT_ENDS_BEFORE_START_MESSAGE);

    resolveCreate({ id: 42, series_id: 7 });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Repeat/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Create task" })).toBeEnabled();
    submit();
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ series: null }),
      ),
    );
  });

  it("submits a series payload when the repeat section is expanded", async () => {
    renderDialog();
    mockedCreate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof createTask>>,
    );

    fillTitle();
    fireEvent.click(screen.getByRole("button", { name: /Repeat/ }));
    fireEvent.click(screen.getByRole("button", { name: "weeks" }));
    submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][0].series).toMatchObject({
      recurrence: {
        kind: RecurrenceKind.Weekly,
        interval_weeks: 1,
        weekdays: [todayWeekday()],
      },
      end_date: null,
    });
  });
});
