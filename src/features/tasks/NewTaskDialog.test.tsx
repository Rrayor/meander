import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ApiError } from "@/api/transport";
import { createTask } from "@/api/tasks";
import {
  NewTaskDialog,
  SERVER_ERROR_MESSAGES,
  serverErrorMessage,
} from "@/features/tasks/NewTaskDialog";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  createTask: vi.fn(),
}));

const mockedCreate = vi.mocked(createTask);

const renderDialog = (onClose = vi.fn()) => {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <NewTaskDialog onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
};

const fillTitle = (value = "Write tests") =>
  fireEvent.change(screen.getByLabelText(/Title/), { target: { value } });

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));

describe("NewTaskDialog", () => {
  beforeEach(() => mockedCreate.mockReset());

  it("validates the title on blur before submit", async () => {
    renderDialog();
    const title = screen.getByLabelText(/Title/);
    fireEvent.focus(title);
    fireEvent.blur(title);
    expect(
      await screen.findByText("Task title is required"),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("shows the duration range error when hours exceed the maximum", async () => {
    renderDialog();
    const hours = screen.getByLabelText("Estimated hours");
    fireEvent.change(hours, { target: { value: "30" } });
    fireEvent.blur(hours);
    expect(
      await screen.findByText(/must be between 1 minute and 24 hours/),
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
      title: "Write tests",
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

  // The end-to-end server-error path (reject → React Query → inline alert →
  // dialog stays open) is covered by the Playwright suite — vitest flags the
  // mocked rejection as unhandled even though the mutation handles it.
  it("maps typed error codes to user-facing copy", () => {
    expect(SERVER_ERROR_MESSAGES.task_title_required).toBe(
      "Task title is required",
    );
    expect(SERVER_ERROR_MESSAGES.estimated_time_out_of_range).toContain(
      "24 hours",
    );
  });

  it.each([
    [
      new ApiError("task_title_required", "validation", "backend copy"),
      "Task title is required",
    ],
    [
      new ApiError("profile_name_required", "validation", "backend copy"),
      "backend copy",
    ],
    [new Error("db offline"), "db offline"],
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
