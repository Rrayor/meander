import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { resolveCarryOver } from "@/api/tasks";
import type { Task } from "@/api/bindings";
import {
  CARRY_OVER_APPLY_LABEL,
  CARRY_OVER_DISMISS_LABEL,
  CARRY_OVER_CARRY_LABEL,
  CARRY_OVER_RETURN_LABEL,
} from "@/lib/labels";
import { TaskPlacement, TaskStatus } from "@/lib/enums";
import { CarryOverPrompt } from "@/features/board/CarryOverPrompt";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tasks")>()),
  resolveCarryOver: vi.fn(),
}));

const mockedResolve = vi.mocked(resolveCarryOver);
const onDone = vi.fn();

const task = (id: number, title: string): Task => ({
  id,
  profile_id: 1,
  title,
  description: null,
  status: TaskStatus.Todo,
  carry_over_rule: null,
  estimated_minutes: null,
  spent_minutes: null,
  placement: TaskPlacement.Backlog,
  scheduled_date: "2026-10-10",
  series_id: null,
  sort_order: 0,
  created_at: "",
  updated_at: "",
});

const tasks = [task(1, "Leftover"), task(2, "Stray")];

const renderPrompt = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <CarryOverPrompt tasks={tasks} onDone={onDone} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  mockedResolve.mockReset();
  mockedResolve.mockResolvedValue(undefined);
  onDone.mockClear();
});

describe("CarryOverPrompt", () => {
  it("applies each task's picked rule and closes", async () => {
    renderPrompt();
    fireEvent.click(
      screen.getAllByRole("button", { name: CARRY_OVER_CARRY_LABEL })[0],
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: CARRY_OVER_RETURN_LABEL })[1],
    );
    fireEvent.click(
      screen.getByRole("button", { name: CARRY_OVER_APPLY_LABEL }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockedResolve).toHaveBeenCalledWith(1, "carry");
    expect(mockedResolve).toHaveBeenCalledWith(2, "return");
  });

  it("keeps Apply disabled until every task has a decision", async () => {
    renderPrompt();
    const apply = screen.getByRole("button", { name: CARRY_OVER_APPLY_LABEL });
    expect(apply).toBeDisabled();
    fireEvent.click(
      screen.getAllByRole("button", { name: CARRY_OVER_CARRY_LABEL })[0],
    );
    expect(apply).toBeDisabled();
    fireEvent.click(
      screen.getAllByRole("button", { name: CARRY_OVER_RETURN_LABEL })[1],
    );
    expect(apply).toBeEnabled();
  });

  it("lets a choice be switched before applying", async () => {
    renderPrompt();
    fireEvent.click(
      screen.getAllByRole("button", { name: CARRY_OVER_CARRY_LABEL })[0],
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: CARRY_OVER_RETURN_LABEL })[0],
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: CARRY_OVER_CARRY_LABEL })[1],
    );
    fireEvent.click(
      screen.getByRole("button", { name: CARRY_OVER_APPLY_LABEL }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockedResolve).toHaveBeenCalledWith(1, "return");
    expect(mockedResolve).toHaveBeenCalledWith(2, "carry");
  });

  it("surfaces a rejection and keeps the prompt open", async () => {
    mockedResolve.mockRejectedValue(new Error("backend refused"));
    renderPrompt();
    fireEvent.click(
      screen.getAllByRole("button", { name: CARRY_OVER_CARRY_LABEL })[0],
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: CARRY_OVER_CARRY_LABEL })[1],
    );
    fireEvent.click(
      screen.getByRole("button", { name: CARRY_OVER_APPLY_LABEL }),
    );
    await screen.findByRole("alert");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("dismisses without resolving — undecided tasks stay pending", async () => {
    renderPrompt();
    fireEvent.click(
      screen.getByRole("button", { name: CARRY_OVER_DISMISS_LABEL }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockedResolve).not.toHaveBeenCalled();
  });

  it("marks the picked choice as pressed for screen readers", () => {
    renderPrompt();
    const carry = screen.getAllByRole("button", {
      name: CARRY_OVER_CARRY_LABEL,
    })[0];
    expect(carry).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(carry);
    expect(carry).toHaveAttribute("aria-pressed", "true");
  });
});
