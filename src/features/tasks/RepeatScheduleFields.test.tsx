import { RecurrenceKind, Weekday } from "@/lib/enums";
import { fireEvent, render, screen } from "@testing-library/react";

import type { NewSeries } from "@/api/bindings";
import { RepeatScheduleFields } from "@/features/tasks/RepeatScheduleFields";
import {
  REPEAT_DAY_OF_MONTH_LABEL,
  REPEAT_ENDS_BEFORE_START_MESSAGE,
  REPEAT_ENDS_ADD_LABEL,
  REPEAT_ENDS_LABEL,
  REPEAT_ENDS_NO_OCCURRENCE_MESSAGE,
  REPEAT_EVERY_LABEL,
  REPEAT_MONTHLY_CLAMP_HINT,
  REPEAT_NONE_SUMMARY,
  REPEAT_ON_THE_LABEL,
  REPEAT_SECTION_LABEL,
  REPEAT_STARTS_LABEL,
  WEEKDAY_OPTIONS,
} from "@/lib/labels";
import { todayLocalIso, weekdayOfIso } from "@/lib/utils";

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

const todayWeekday = () => weekdayOfIso(todayLocalIso());

const WEDNESDAY_ISO = "2026-10-21"; // a Wednesday
const FRIDAY_ISO = "2026-10-23"; // a Friday

describe("RepeatScheduleFields", () => {
  it("starts collapsed with a no-repeat summary", () => {
    renderField();
    const toggle = screen.getByRole("button", { name: /Repeat/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(REPEAT_NONE_SUMMARY)).toBeInTheDocument();
    expect(screen.queryByLabelText(REPEAT_EVERY_LABEL)).not.toBeInTheDocument();
  });

  it("emits a daily series with today's start date on expand", () => {
    const onChange = renderField();
    expand();
    const series = lastSeries(onChange);
    expect(series).toMatchObject({
      recurrence: { kind: RecurrenceKind.Daily, interval_days: 1 },
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
    fireEvent.click(screen.getByRole("button", { name: "weeks" }));
    fireEvent.click(screen.getByRole("button", { name: "Friday" }));
    const series = lastSeries(onChange);
    expect(series?.recurrence).toMatchObject({
      kind: RecurrenceKind.Weekly,
      interval_weeks: 1,
    });
    const { weekdays } = series?.recurrence as {
      weekdays: Weekday[];
    };
    expect(new Set(weekdays)).toEqual(
      new Set([todayWeekday(), Weekday.Friday]),
    );
  });

  it("does not allow deselecting the last weekly weekday", () => {
    const onChange = renderField();
    expand();
    fireEvent.click(screen.getByRole("button", { name: "weeks" }));
    const only = screen.getByRole("button", {
      name: WEEKDAY_OPTIONS.find((w) => w.value === todayWeekday())!.label,
    });
    fireEvent.click(only);
    expect(
      (lastSeries(onChange)?.recurrence as { weekdays: Weekday[] }).weekdays,
    ).toHaveLength(1);
  });

  it("syncs the weekly weekday to the start date until touched", () => {
    const onChange = renderField();
    expand();
    fireEvent.click(screen.getByRole("button", { name: "weeks" }));
    fireEvent.change(screen.getByLabelText(REPEAT_STARTS_LABEL), {
      target: { value: WEDNESDAY_ISO },
    });
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: RecurrenceKind.Weekly,
      interval_weeks: 1,
      weekdays: [Weekday.Wednesday],
    });
    // Once the user picks a day manually, start-date changes leave it alone.
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    fireEvent.change(screen.getByLabelText(REPEAT_STARTS_LABEL), {
      target: { value: FRIDAY_ISO },
    });
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: RecurrenceKind.Weekly,
      interval_weeks: 1,
      weekdays: [Weekday.Wednesday, Weekday.Monday],
    });
  });

  it("emits monthly-day recurrence and shows the clamp hint above 28", () => {
    const onChange = renderField();
    expand();
    fireEvent.click(screen.getByRole("button", { name: "months" }));
    fireEvent.change(screen.getByLabelText(REPEAT_DAY_OF_MONTH_LABEL), {
      target: { value: "31" },
    });
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: RecurrenceKind.MonthlyDay,
      interval_months: 1,
      day: 31,
    });
    expect(screen.getByText(REPEAT_MONTHLY_CLAMP_HINT)).toBeInTheDocument();
  });

  it("syncs the monthly selections to the start date until touched", () => {
    const onChange = renderField();
    expand();
    fireEvent.click(screen.getByRole("button", { name: "months" }));
    // 2026-10-19 is a Monday and the month's 3rd Monday.
    fireEvent.change(screen.getByLabelText(REPEAT_STARTS_LABEL), {
      target: { value: "2026-10-19" },
    });
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: RecurrenceKind.MonthlyDay,
      interval_months: 1,
      day: 19,
    });
    // Switching to "On the" keeps the synced 3rd Monday.
    fireEvent.click(screen.getByRole("radio", { name: REPEAT_ON_THE_LABEL }));
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: RecurrenceKind.MonthlyNthWeekday,
      interval_months: 1,
      nth: 3,
      weekday: Weekday.Monday,
    });
    // A mode switch alone is not a manual edit — the selection keeps
    // tracking the start date (3rd Wednesday for 2026-10-21).
    fireEvent.change(screen.getByLabelText(REPEAT_STARTS_LABEL), {
      target: { value: WEDNESDAY_ISO },
    });
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: RecurrenceKind.MonthlyNthWeekday,
      interval_months: 1,
      nth: 3,
      weekday: Weekday.Wednesday,
    });
    // A manual change stops the tracking — later start changes keep the
    // user's selection.
    fireEvent.click(screen.getByRole("button", { name: "First" }));
    fireEvent.change(screen.getByLabelText(REPEAT_STARTS_LABEL), {
      target: { value: FRIDAY_ISO },
    });
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: RecurrenceKind.MonthlyNthWeekday,
      interval_months: 1,
      nth: 1,
      weekday: Weekday.Wednesday,
    });
  });

  it("flags an end date before the start date and reports the error", () => {
    const onChange = renderField();
    expand();
    fireEvent.click(screen.getByText(REPEAT_ENDS_ADD_LABEL));
    fireEvent.change(screen.getByLabelText(REPEAT_ENDS_LABEL), {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(screen.getByLabelText(REPEAT_STARTS_LABEL), {
      target: { value: "2027-02-01" },
    });
    const ends = screen.getByLabelText(REPEAT_ENDS_LABEL);
    expect(ends).toHaveAttribute("aria-invalid", "true");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(REPEAT_ENDS_BEFORE_START_MESSAGE);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(REPEAT_ENDS_BEFORE_START_MESSAGE);
    // Correcting the range clears the error again.
    fireEvent.change(screen.getByLabelText(REPEAT_STARTS_LABEL), {
      target: { value: "2026-12-01" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBeNull();
  });

  it("flags an end date the schedule never reaches", () => {
    const onChange = renderField();
    expand();
    // Wednesday-only weekly starting Monday 2026-10-19, ending that same
    // Monday — the schedule can never occur.
    fireEvent.change(screen.getByLabelText(REPEAT_STARTS_LABEL), {
      target: { value: "2026-10-19" },
    });
    fireEvent.click(screen.getByRole("button", { name: "weeks" }));
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    const monday = screen.getByRole("button", { name: "Monday" });
    // Only Wednesday stays selected — deselect the synced Monday.
    if (monday.getAttribute("aria-pressed") === "true") {
      fireEvent.click(monday);
    }
    fireEvent.click(screen.getByText(REPEAT_ENDS_ADD_LABEL));
    fireEvent.change(screen.getByLabelText(REPEAT_ENDS_LABEL), {
      target: { value: "2026-10-19" },
    });

    const ends = screen.getByLabelText(REPEAT_ENDS_LABEL);
    expect(ends).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      REPEAT_ENDS_NO_OCCURRENCE_MESSAGE,
    );
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe(
      REPEAT_ENDS_NO_OCCURRENCE_MESSAGE,
    );
    // Extending the end past the first occurrence clears the error.
    fireEvent.change(ends, { target: { value: "2026-10-21" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBeNull();
  });

  it("emits monthly nth-weekday recurrence", () => {
    const onChange = renderField();
    expand();
    fireEvent.click(screen.getByRole("button", { name: "months" }));
    fireEvent.click(screen.getByRole("radio", { name: REPEAT_ON_THE_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: "Last" }));
    fireEvent.click(screen.getByRole("button", { name: "Friday" }));
    expect(lastSeries(onChange)?.recurrence).toEqual({
      kind: RecurrenceKind.MonthlyNthWeekday,
      interval_months: 1,
      nth: -1,
      weekday: Weekday.Friday,
    });
  });

  it("emits the optional end date", () => {
    const onChange = renderField();
    expand();
    fireEvent.click(screen.getByText(REPEAT_ENDS_ADD_LABEL));
    fireEvent.change(screen.getByLabelText(REPEAT_ENDS_LABEL), {
      target: { value: "2027-01-01" },
    });
    expect(lastSeries(onChange)?.end_date).toBe("2027-01-01");
  });
});
