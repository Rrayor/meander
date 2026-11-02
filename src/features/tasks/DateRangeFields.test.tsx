import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  REPEAT_ENDS_ADD_LABEL,
  REPEAT_ENDS_LABEL,
  REPEAT_STARTS_LABEL,
} from "@/lib/labels";

import { DateRangeFields } from "./DateRangeFields";

const PROPS = {
  idPrefix: "t",
  startDate: "2026-11-02",
  endDate: "",
  errors: {},
};

describe("DateRangeFields", () => {
  it("emits start changes", () => {
    const onStartChange = vi.fn();
    render(
      <DateRangeFields
        {...PROPS}
        onStartChange={onStartChange}
        onEndDateChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(REPEAT_STARTS_LABEL), {
      target: { value: "2026-11-09" },
    });
    expect(onStartChange).toHaveBeenCalledWith("2026-11-09");
  });

  it("locks the start field read-only when anchored", () => {
    render(
      <DateRangeFields
        {...PROPS}
        lockedStartDate="2026-11-02"
        onStartChange={vi.fn()}
        onEndDateChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(REPEAT_STARTS_LABEL)).toHaveAttribute(
      "readonly",
    );
  });

  it("offers the end-date add button only while open-ended", () => {
    const onEndDateChange = vi.fn();
    render(
      <DateRangeFields
        {...PROPS}
        onStartChange={vi.fn()}
        onEndDateChange={onEndDateChange}
      />,
    );
    expect(screen.queryByLabelText(REPEAT_ENDS_LABEL)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: REPEAT_ENDS_ADD_LABEL }),
    );
    expect(onEndDateChange).toHaveBeenCalledWith(PROPS.startDate);
  });

  it("renders a start-date error as an alert", () => {
    render(
      <DateRangeFields
        {...PROPS}
        errors={{ startDate: "Starts must be a real date" }}
        onStartChange={vi.fn()}
        onEndDateChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Starts must be a real date",
    );
  });
});
