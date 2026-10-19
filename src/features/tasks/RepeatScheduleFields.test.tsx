import { fireEvent, render, screen } from "@testing-library/react";

import type { NewSeries } from "@/api/bindings";
import { RepeatScheduleFields } from "@/features/tasks/RepeatScheduleFields";
import {
  FREQUENCY_FIELD_LABEL,
  REPEAT_DAY_LABEL,
  REPEAT_ENDS_LABEL,
  REPEAT_MONTHLY_CLAMP_HINT,
  REPEAT_NONE_SUMMARY,
  REPEAT_SECTION_LABEL,
  REPEAT_STARTS_LABEL,
} from "@/lib/labels";

const ID_PREFIX = "test-task";

const renderField = () => {
  const onChange = vi.fn();
  render(<RepeatScheduleFields idPrefix={ID_PREFIX} onChange={onChange} />);
  return onChange;
};

const expand = () =>
  fireEvent.click(screen.getByRole("button", { name: /Repeat/ }));

const lastSeries = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as NewSeries | null;

describe("RepeatScheduleFields", () => {
  it("starts collapsed with a no-repeat summary", () => {
    renderField();
    const toggle = screen.getByRole("button", { name: /Repeat/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(REPEAT_NONE_SUMMARY)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(FREQUENCY_FIELD_LABEL),
    ).not.toBeInTheDocument();
  });

  it("emits a daily series with today's start date on expand", () => {
    const onChange = renderField();
    expand();
    const series = lastSeries(onChange);
    expect(series).toMatchObject({
      recurrence: { kind: "daily", interval_days: 1 },
      end_date: null,
    });
    expect(series?.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("emits null when collapsed again", () => {
    const onChange = renderField();
    expand();
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) }),
    );
    expect(lastSeries(onChange)).toBeNull();
  });

  it("emits weekly weekdays from the toggle chips", () => {
    const onChange = renderField();
    expand();
    fireEvent.change(screen.getByLabelText(FREQUENCY_FIELD_LABEL), {
      target: { value: "weekly" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Friday" }));
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: "weekly",
      interval_weeks: 1,
      weekdays: ["monday", "friday"],
    });
  });

  it("does not allow deselecting the last weekly weekday", () => {
    const onChange = renderField();
    expand();
    fireEvent.change(screen.getByLabelText(FREQUENCY_FIELD_LABEL), {
      target: { value: "weekly" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: "weekly",
      interval_weeks: 1,
      weekdays: ["monday"],
    });
  });

  it("emits monthly-day recurrence and shows the clamp hint above 28", () => {
    const onChange = renderField();
    expand();
    fireEvent.change(screen.getByLabelText(FREQUENCY_FIELD_LABEL), {
      target: { value: "monthly_day" },
    });
    fireEvent.change(screen.getByLabelText(REPEAT_DAY_LABEL), {
      target: { value: "31" },
    });
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: "monthly_day",
      interval_months: 1,
      day: 31,
    });
    expect(screen.getByText(REPEAT_MONTHLY_CLAMP_HINT)).toBeInTheDocument();
  });

  it("emits monthly nth-weekday recurrence", () => {
    const onChange = renderField();
    expand();
    fireEvent.change(screen.getByLabelText(FREQUENCY_FIELD_LABEL), {
      target: { value: "monthly_nth_weekday" },
    });
    fireEvent.change(screen.getByLabelText("Which occurrence"), {
      target: { value: "-1" },
    });
    fireEvent.change(screen.getByLabelText("Weekday"), {
      target: { value: "friday" },
    });
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: "monthly_nth_weekday",
      interval_months: 1,
      nth: -1,
      weekday: "friday",
    });
  });

  it("emits the optional end date", () => {
    const onChange = renderField();
    expand();
    fireEvent.change(screen.getByLabelText(REPEAT_ENDS_LABEL), {
      target: { value: "2027-01-01" },
    });
    expect(lastSeries(onChange)?.end_date).toBe("2027-01-01");
  });

  it("labels the start date field", () => {
    renderField();
    expand();
    expect(screen.getByLabelText(REPEAT_STARTS_LABEL)).toBeRequired();
  });
});
