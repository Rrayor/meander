import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { addTaskCategory, listCategories } from "@/api/categories";
import { MAX_DURATION_MINUTES, MAX_TASK_TITLE_LENGTH } from "@/api/tasks";
import { ApiError } from "@/api/transport";
import { createTask } from "@/api/tasks";
import { NewTaskDialog } from "@/features/tasks/NewTaskDialog";
import {
  SERVER_ERROR_MESSAGES,
  TASK_TITLE_INVALID_CHARACTERS_MESSAGE,
  serverErrorMessage,
} from "@/lib/errors";
import { TITLE_REQUIRED_MESSAGE } from "@/lib/labels";
import { categoryFixture } from "@/test/fixtures";
import { testQueryClient } from "@/test/queryClient";
import { MULTI_UNIT_EMOJI } from "@/test/unicode";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  createTask: vi.fn(),
}));

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
  addTaskCategory: vi.fn(),
}));

const mockedCreate = vi.mocked(createTask);
const mockedListCategories = vi.mocked(listCategories);
const mockedAddTaskCategory = vi.mocked(addTaskCategory);

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

describe("NewTaskDialog", () => {
  beforeEach(() => {
    mockedCreate.mockReset();
    mockedListCategories.mockReset().mockResolvedValue([ERRANDS]);
    mockedAddTaskCategory.mockReset().mockResolvedValue(undefined);
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
      carry_over_rule: "carry",
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
});
