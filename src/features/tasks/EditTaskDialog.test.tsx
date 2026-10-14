import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { updateTask } from "@/api/tasks";
import type { Task } from "@/api/tasks";
import { EditTaskDialog } from "@/features/tasks/EditTaskDialog";
import { SPENT_RANGE_MESSAGE } from "@/lib/errors";
import {
  CANCEL_BUTTON_LABEL,
  EDIT_TASK_HEADING,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  SAVE_BUTTON_LABEL,
  SPENT_HOURS_LABEL,
  SPENT_MINUTES_LABEL,
  STATUS_LABELS,
  TITLE_REQUIRED_MESSAGE,
} from "@/lib/labels";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  updateTask: vi.fn(),
}));

const mockedUpdate = vi.mocked(updateTask);

const TITLE_ORIGINAL = "Draft weekly reflection notes";
const TITLE_EDITED = "Review quarterly milestone planning";
const DESCRIPTION_EDITED = "Flag risks early";

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
  sort_order: 1,
  created_at: "2026-10-11 10:00:00",
  updated_at: "2026-10-12 09:00:00",
};

const renderDialog = (task: Task = baseTask) =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <EditTaskDialog task={task} onClose={vi.fn()} />
    </QueryClientProvider>,
  );

describe("EditTaskDialog", () => {
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
    expect(screen.getByText(/Created .* · Last updated/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: CANCEL_BUTTON_LABEL }));
    expect(onClose).toHaveBeenCalled();
  });
});
