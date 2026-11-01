import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import {
  DurationField,
  HOURS_UNIT_CAPTION,
  MINUTES_UNIT_CAPTION,
} from "./DurationField";

const GROUP_LABEL = "Estimated time";
const ID_PREFIX = "edit-task-est";
const ERROR_MESSAGE = "Enter a positive estimate";
const SUBMIT_LABEL = "Save";
const TYPED_HOURS = "2";
const TYPED_MINUTES = "45";

interface FormValues {
  estHours: string;
  estMinutes: string;
}

const hoursInput = () =>
  screen.getByRole("spinbutton", { name: HOURS_UNIT_CAPTION });
const minutesInput = () =>
  screen.getByRole("spinbutton", { name: MINUTES_UNIT_CAPTION });

interface HarnessProps {
  inputLabels?: { hours: string; minutes: string };
  error?: string;
  errorId?: string;
  disabled?: boolean;
  onSubmit?: (values: FormValues) => void;
  refSpy?: (el: unknown) => void;
}

function Harness({
  inputLabels,
  error,
  errorId,
  disabled,
  onSubmit = vi.fn(),
  refSpy,
}: Readonly<HarnessProps>) {
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { estHours: "", estMinutes: "" },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DurationField
        label={GROUP_LABEL}
        idPrefix={ID_PREFIX}
        names={{ hours: "estHours", minutes: "estMinutes" }}
        register={
          refSpy
            ? (name, options) => {
                const registration = register(name, options);
                return {
                  ...registration,
                  ref: (el: HTMLInputElement | null) => {
                    registration.ref(el);
                    refSpy(el);
                  },
                };
              }
            : register
        }
        inputLabels={inputLabels}
        error={error}
        errorId={errorId}
        disabled={disabled}
      />
      <button type="submit">{SUBMIT_LABEL}</button>
    </form>
  );
}

describe("DurationField", () => {
  it("groups the pair in a fieldset named by the label", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: GROUP_LABEL });
    expect(group).toContainElement(hoursInput());
    expect(group).toContainElement(minutesInput());
  });

  it("renders two labelled number inputs under the id prefix", () => {
    render(<Harness />);
    for (const [input, suffix] of [
      [hoursInput(), "hours"],
      [minutesInput(), "minutes"],
    ] as const) {
      expect(input).toHaveAttribute("id", `${ID_PREFIX}-${suffix}`);
      expect(input).toHaveAttribute("type", "number");
      expect(input).toHaveClass("w-20");
    }
  });

  it("renders no alert and no invalid markers while error is absent", () => {
    render(<Harness />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(hoursInput()).not.toHaveAttribute("aria-invalid");
    expect(minutesInput()).not.toHaveAttribute("aria-invalid");
  });

  it("exposes the shared error as an alert describing both inputs", () => {
    render(<Harness error={ERROR_MESSAGE} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(ERROR_MESSAGE);
    for (const input of [hoursInput(), minutesInput()]) {
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    }
  });

  it("names the inputs by inputLabels over the visible captions", () => {
    render(
      <Harness
        inputLabels={{ hours: "Estimated hours", minutes: "Estimated minutes" }}
      />,
    );
    expect(
      screen.getByRole("spinbutton", { name: "Estimated hours" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "Estimated minutes" }),
    ).toBeInTheDocument();
  });

  it("renders the alert under errorId while still describing the inputs", () => {
    render(<Harness error={ERROR_MESSAGE} errorId="task-estimate-error" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "task-estimate-error");
    expect(hoursInput().getAttribute("aria-describedby")).toContain(
      "task-estimate-error",
    );
  });

  it("disables both inputs and dims the pair when disabled", () => {
    render(<Harness disabled />);
    expect(screen.getByRole("group", { name: GROUP_LABEL })).toBeDisabled();
    expect(hoursInput()).toBeDisabled();
    expect(minutesInput()).toBeDisabled();
    const pairRow = hoursInput().parentElement?.parentElement;
    expect(pairRow).toHaveClass("flex", "items-center", "gap-4", "opacity-50");
  });

  it("keeps the row undimmed while enabled", () => {
    render(<Harness />);
    const pairRow = hoursInput().parentElement?.parentElement;
    expect(pairRow).toHaveClass("flex", "items-center", "gap-4");
    expect(pairRow).not.toHaveClass("opacity-50");
  });

  it("registers both inputs under names and submits their values", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    fireEvent.change(hoursInput(), { target: { value: TYPED_HOURS } });
    fireEvent.change(minutesInput(), { target: { value: TYPED_MINUTES } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      estHours: TYPED_HOURS,
      estMinutes: TYPED_MINUTES,
    });
  });

  it("passes each registration ref through to its input element", () => {
    const refSpy = vi.fn();
    render(<Harness refSpy={refSpy} />);
    // The registration ref must reach the rendered <input> through the
    // Field.Control render-prop merge — a swallowed ref breaks RHF
    // focus-on-error.
    expect(refSpy).toHaveBeenCalledWith(hoursInput());
    expect(refSpy).toHaveBeenCalledWith(minutesInput());
  });
});
