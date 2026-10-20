import { describe, expect, it } from "vitest";
import type { Recurrence } from "@/api/bindings";
import { describeRecurrence, isScheduledOn } from "@/lib/recurrence";
import { REPEAT_UNIT_OPTIONS, WEEKDAY_OPTIONS } from "@/lib/labels";

const MONDAY = WEEKDAY_OPTIONS.find((w) => w.value === "monday")!.label;
const FRIDAY = WEEKDAY_OPTIONS.find((w) => w.value === "friday")!.label;

const START = "2026-10-05"; // a Monday

describe("isScheduledOn", () => {
  it("daily: matches every N days from the start", () => {
    const recurrence: Recurrence = { kind: "daily", interval_days: 3 };
    expect(isScheduledOn(recurrence, START, null, "2026-10-05")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-08")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-06")).toBe(false);
    expect(isScheduledOn(recurrence, START, null, "2026-10-12")).toBe(false);
  });

  it("weekly: matches selected weekdays in every-Nth week", () => {
    const recurrence: Recurrence = {
      kind: "weekly",
      interval_weeks: 2,
      weekdays: ["monday", "friday"],
    };
    // same week as start
    expect(isScheduledOn(recurrence, START, null, "2026-10-05")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-09")).toBe(true);
    // one week out — interval does not match
    expect(isScheduledOn(recurrence, START, null, "2026-10-12")).toBe(false);
    // two weeks out — interval matches
    expect(isScheduledOn(recurrence, START, null, "2026-10-19")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-23")).toBe(true);
    // matching interval, wrong weekday
    expect(isScheduledOn(recurrence, START, null, "2026-10-21")).toBe(false);
  });

  it("weekly: anchors the interval on the start week, not epoch Monday", () => {
    const recurrence: Recurrence = {
      kind: "weekly",
      interval_weeks: 2,
      weekdays: ["thursday"],
    };
    // start Wednesday 2026-10-07; Thursdays of that week and every 2nd week after
    expect(isScheduledOn(recurrence, "2026-10-07", null, "2026-10-08")).toBe(
      true,
    );
    expect(isScheduledOn(recurrence, "2026-10-07", null, "2026-10-22")).toBe(
      true,
    );
    expect(isScheduledOn(recurrence, "2026-10-07", null, "2026-10-15")).toBe(
      false,
    );
  });

  it("monthly_day: matches the configured day in every-Nth month", () => {
    const recurrence: Recurrence = {
      kind: "monthly_day",
      interval_months: 2,
      day: 15,
    };
    expect(isScheduledOn(recurrence, START, null, "2026-10-15")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-11-15")).toBe(false);
    expect(isScheduledOn(recurrence, START, null, "2026-12-15")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-12-16")).toBe(false);
  });

  it("monthly_day: clamps day 31 to the last day of short months", () => {
    const recurrence: Recurrence = {
      kind: "monthly_day",
      interval_months: 1,
      day: 31,
    };
    const start = "2026-01-15";
    // Jan 31 exact; Feb 2026 clamps to 28 (non-leap); Apr clamps to 30
    expect(isScheduledOn(recurrence, start, null, "2026-01-31")).toBe(true);
    expect(isScheduledOn(recurrence, start, null, "2026-02-28")).toBe(true);
    expect(isScheduledOn(recurrence, start, null, "2026-04-30")).toBe(true);
    expect(isScheduledOn(recurrence, start, null, "2026-04-29")).toBe(false);
  });

  it("monthly_day: clamps to Feb 29 in leap years", () => {
    const recurrence: Recurrence = {
      kind: "monthly_day",
      interval_months: 1,
      day: 31,
    };
    const start = "2028-01-15";
    expect(isScheduledOn(recurrence, start, null, "2028-02-29")).toBe(true);
    expect(isScheduledOn(recurrence, start, null, "2028-02-28")).toBe(false);
  });

  it("monthly_nth_weekday: matches the nth weekday of every-Nth month", () => {
    const recurrence: Recurrence = {
      kind: "monthly_nth_weekday",
      interval_months: 1,
      nth: 2,
      weekday: "friday",
    };
    // Oct 2026: Fridays are 2, 9, 16, 23, 30 → 2nd is Oct 9
    expect(isScheduledOn(recurrence, START, null, "2026-10-09")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-16")).toBe(false);
    // Nov 2026: Fridays are 6, 13, 20, 27 → 2nd is Nov 13
    expect(isScheduledOn(recurrence, START, null, "2026-11-13")).toBe(true);
  });

  it("monthly_nth_weekday: nth = -1 matches the last matching weekday", () => {
    const recurrence: Recurrence = {
      kind: "monthly_nth_weekday",
      interval_months: 1,
      nth: -1,
      weekday: "friday",
    };
    expect(isScheduledOn(recurrence, START, null, "2026-10-30")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-23")).toBe(false);
    expect(isScheduledOn(recurrence, START, null, "2026-11-27")).toBe(true);
  });

  it("monthly_nth_weekday: nth beyond the month's count never matches", () => {
    const recurrence: Recurrence = {
      kind: "monthly_nth_weekday",
      interval_months: 1,
      nth: 5,
      weekday: "monday",
    };
    // Feb 2026 and Oct 2026 each have only 4 Mondays — no 5th exists
    expect(isScheduledOn(recurrence, START, null, "2026-02-23")).toBe(false);
    expect(isScheduledOn(recurrence, START, null, "2026-10-26")).toBe(false);
  });

  it("rejects dates before the start and after the end", () => {
    const recurrence: Recurrence = { kind: "daily", interval_days: 1 };
    expect(isScheduledOn(recurrence, START, "2026-10-10", "2026-10-04")).toBe(
      false,
    );
    expect(isScheduledOn(recurrence, START, "2026-10-10", "2026-10-11")).toBe(
      false,
    );
    expect(isScheduledOn(recurrence, START, "2026-10-10", "2026-10-10")).toBe(
      true,
    );
    expect(isScheduledOn(recurrence, START, "2026-10-10", "2026-10-05")).toBe(
      true,
    );
  });

  it("weekly: a weekday before the start date in the start week is excluded", () => {
    const recurrence: Recurrence = {
      kind: "weekly",
      interval_weeks: 1,
      weekdays: ["monday"],
    };
    // starts Wednesday; Monday of that same week is before the start
    expect(isScheduledOn(recurrence, "2026-10-07", null, "2026-10-05")).toBe(
      false,
    );
    expect(isScheduledOn(recurrence, "2026-10-07", null, "2026-10-12")).toBe(
      true,
    );
  });

  it("malformed or unsupported recurrences never match", () => {
    const workday: Recurrence = { kind: "workday_after", day: 15 };
    expect(isScheduledOn(workday, START, null, "2026-10-15")).toBe(false);
    const daily: Recurrence = { kind: "daily", interval_days: 0 };
    expect(isScheduledOn(daily, START, null, START)).toBe(false);
  });

  it("malformed dates never match", () => {
    const recurrence: Recurrence = { kind: "daily", interval_days: 1 };
    expect(isScheduledOn(recurrence, "not-a-date", null, "2026-10-05")).toBe(
      false,
    );
    expect(isScheduledOn(recurrence, START, null, "2026-13-40")).toBe(false);
  });
});

describe("describeRecurrence", () => {
  const day = REPEAT_UNIT_OPTIONS.find((o) => o.value === "day")!.label;
  const week = REPEAT_UNIT_OPTIONS.find((o) => o.value === "week")!.label;
  const month = REPEAT_UNIT_OPTIONS.find((o) => o.value === "month")!.label;
  const singular = (unit: string) => unit.slice(0, -1);

  it("describes each supported cadence", () => {
    expect(describeRecurrence({ kind: "daily", interval_days: 1 })).toBe(
      `every ${singular(day)}`,
    );
    expect(describeRecurrence({ kind: "daily", interval_days: 3 })).toBe(
      `every 3 ${day}`,
    );
    expect(
      describeRecurrence({
        kind: "weekly",
        interval_weeks: 2,
        weekdays: ["monday", "friday"],
      }),
    ).toBe(`every 2 ${week} on ${MONDAY} and ${FRIDAY}`);
    expect(
      describeRecurrence({
        kind: "monthly_day",
        interval_months: 1,
        day: 15,
      }),
    ).toBe(`every ${singular(month)} on day 15`);
    expect(
      describeRecurrence({
        kind: "monthly_nth_weekday",
        interval_months: 1,
        nth: -1,
        weekday: "friday",
      }),
    ).toBe(`every ${singular(month)} on the Last ${FRIDAY}`);
    expect(describeRecurrence({ kind: "workday_after", day: 15 })).toBe(
      "the first workday after day 15",
    );
  });
});
