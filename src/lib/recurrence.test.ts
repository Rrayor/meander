import { RecurrenceKind, RepeatUnit, Weekday } from "@/lib/enums";
import { describe, expect, it } from "vitest";
import type { Recurrence } from "@/api/bindings";
import { firstOccurrence, isScheduledOn } from "@/lib/recurrence";
import {
  REPEAT_UNIT_OPTIONS,
  WEEKDAY_OPTIONS,
  describeRecurrence,
  workdayAfterLabel,
} from "@/lib/labels";

const MONDAY = WEEKDAY_OPTIONS.find((w) => w.value === Weekday.Monday)!.label;
const FRIDAY = WEEKDAY_OPTIONS.find((w) => w.value === Weekday.Friday)!.label;

// Contract pin: the recurrence math indexes weekdays by WEEKDAY_OPTIONS
// order, which must mirror the backend `Weekday` enum (Monday = 0). If the
// week-start display setting ever tempts a reorder of this registry, this
// fails before the math silently shifts.
describe("WEEKDAY_OPTIONS canonical order", () => {
  it("matches the backend Weekday enum order, Monday first", () => {
    expect(WEEKDAY_OPTIONS.map((w) => w.value)).toEqual(Object.values(Weekday));
  });
});

const START = "2026-10-05"; // a Monday

describe("isScheduledOn", () => {
  it("daily: matches every N days from the start", () => {
    const recurrence: Recurrence = {
      kind: RecurrenceKind.Daily,
      interval_days: 3,
    };
    expect(isScheduledOn(recurrence, START, null, "2026-10-05")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-08")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-06")).toBe(false);
    expect(isScheduledOn(recurrence, START, null, "2026-10-12")).toBe(false);
  });

  it("weekly: matches selected weekdays in every-Nth week", () => {
    const recurrence: Recurrence = {
      kind: RecurrenceKind.Weekly,
      interval_weeks: 2,
      weekdays: [Weekday.Monday, Weekday.Friday],
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
      kind: RecurrenceKind.Weekly,
      interval_weeks: 2,
      weekdays: [Weekday.Thursday],
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
      kind: RecurrenceKind.MonthlyDay,
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
      kind: RecurrenceKind.MonthlyDay,
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
      kind: RecurrenceKind.MonthlyDay,
      interval_months: 1,
      day: 31,
    };
    const start = "2028-01-15";
    expect(isScheduledOn(recurrence, start, null, "2028-02-29")).toBe(true);
    expect(isScheduledOn(recurrence, start, null, "2028-02-28")).toBe(false);
  });

  it("monthly_nth_weekday: matches the nth weekday of every-Nth month", () => {
    const recurrence: Recurrence = {
      kind: RecurrenceKind.MonthlyNthWeekday,
      interval_months: 1,
      nth: 2,
      weekday: Weekday.Friday,
    };
    // Oct 2026: Fridays are 2, 9, 16, 23, 30 → 2nd is Oct 9
    expect(isScheduledOn(recurrence, START, null, "2026-10-09")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-16")).toBe(false);
    // Nov 2026: Fridays are 6, 13, 20, 27 → 2nd is Nov 13
    expect(isScheduledOn(recurrence, START, null, "2026-11-13")).toBe(true);
  });

  it("monthly_nth_weekday: nth = -1 matches the last matching weekday", () => {
    const recurrence: Recurrence = {
      kind: RecurrenceKind.MonthlyNthWeekday,
      interval_months: 1,
      nth: -1,
      weekday: Weekday.Friday,
    };
    expect(isScheduledOn(recurrence, START, null, "2026-10-30")).toBe(true);
    expect(isScheduledOn(recurrence, START, null, "2026-10-23")).toBe(false);
    expect(isScheduledOn(recurrence, START, null, "2026-11-27")).toBe(true);
  });

  it("monthly_nth_weekday: nth beyond the month's count never matches", () => {
    const recurrence: Recurrence = {
      kind: RecurrenceKind.MonthlyNthWeekday,
      interval_months: 1,
      nth: 5,
      weekday: Weekday.Monday,
    };
    // Feb 2026 and Oct 2026 each have only 4 Mondays — no 5th exists
    expect(isScheduledOn(recurrence, START, null, "2026-02-23")).toBe(false);
    expect(isScheduledOn(recurrence, START, null, "2026-10-26")).toBe(false);
  });

  it("rejects dates before the start and after the end", () => {
    const recurrence: Recurrence = {
      kind: RecurrenceKind.Daily,
      interval_days: 1,
    };
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
      kind: RecurrenceKind.Weekly,
      interval_weeks: 1,
      weekdays: [Weekday.Monday],
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
    const workday: Recurrence = { kind: RecurrenceKind.WorkdayAfter, day: 15 };
    expect(isScheduledOn(workday, START, null, "2026-10-15")).toBe(false);
    const daily: Recurrence = { kind: RecurrenceKind.Daily, interval_days: 0 };
    expect(isScheduledOn(daily, START, null, START)).toBe(false);
  });

  it("malformed dates never match", () => {
    const recurrence: Recurrence = {
      kind: RecurrenceKind.Daily,
      interval_days: 1,
    };
    expect(isScheduledOn(recurrence, "not-a-date", null, "2026-10-05")).toBe(
      false,
    );
    expect(isScheduledOn(recurrence, START, null, "2026-13-40")).toBe(false);
  });
});

describe("describeRecurrence", () => {
  const day = REPEAT_UNIT_OPTIONS.find(
    (o) => o.value === RepeatUnit.Day,
  )!.label;
  const week = REPEAT_UNIT_OPTIONS.find(
    (o) => o.value === RepeatUnit.Week,
  )!.label;
  const month = REPEAT_UNIT_OPTIONS.find(
    (o) => o.value === RepeatUnit.Month,
  )!.label;
  const singular = (unit: string) => unit.slice(0, -1);

  it("describes each supported cadence", () => {
    expect(
      describeRecurrence({ kind: RecurrenceKind.Daily, interval_days: 1 }),
    ).toBe(`every ${singular(day)}`);
    expect(
      describeRecurrence({ kind: RecurrenceKind.Daily, interval_days: 3 }),
    ).toBe(`every 3 ${day}`);
    expect(
      describeRecurrence({
        kind: RecurrenceKind.Weekly,
        interval_weeks: 2,
        weekdays: [Weekday.Monday, Weekday.Friday],
      }),
    ).toBe(`every 2 ${week} on ${MONDAY} and ${FRIDAY}`);
    expect(
      describeRecurrence({
        kind: RecurrenceKind.MonthlyDay,
        interval_months: 1,
        day: 15,
      }),
    ).toBe(`every ${singular(month)} on day 15`);
    expect(
      describeRecurrence({
        kind: RecurrenceKind.MonthlyNthWeekday,
        interval_months: 1,
        nth: -1,
        weekday: Weekday.Friday,
      }),
    ).toBe(`every ${singular(month)} on the Last ${FRIDAY}`);
    expect(
      describeRecurrence({ kind: RecurrenceKind.WorkdayAfter, day: 15 }),
    ).toBe(workdayAfterLabel(15));
  });
});

describe("firstOccurrence", () => {
  it("lands on the first matching date", () => {
    const MONDAY_START = "2026-10-19"; // a Monday
    // Daily: the start date is always an occurrence.
    expect(
      firstOccurrence(
        { kind: RecurrenceKind.Daily, interval_days: 3 },
        MONDAY_START,
      ),
    ).toBe(MONDAY_START);
    // Weekly including the start weekday.
    expect(
      firstOccurrence(
        {
          kind: RecurrenceKind.Weekly,
          interval_weeks: 1,
          weekdays: [Weekday.Monday],
        },
        MONDAY_START,
      ),
    ).toBe(MONDAY_START);
    // Weekly excluding it, with a later weekday in the same week.
    expect(
      firstOccurrence(
        {
          kind: RecurrenceKind.Weekly,
          interval_weeks: 1,
          weekdays: [Weekday.Wednesday],
        },
        MONDAY_START,
      ),
    ).toBe("2026-10-21");
    // No matching weekday left this week: the next eligible week.
    expect(
      firstOccurrence(
        {
          kind: RecurrenceKind.Weekly,
          interval_weeks: 2,
          weekdays: [Weekday.Monday, Weekday.Friday],
        },
        "2026-10-24", // a Saturday — past both picks for this week
      ),
    ).toBe("2026-11-02");
    // Monthly-day: clamped into the start month, or the next eligible one.
    expect(
      firstOccurrence(
        { kind: RecurrenceKind.MonthlyDay, interval_months: 2, day: 31 },
        MONDAY_START,
      ),
    ).toBe("2026-10-31");
    expect(
      firstOccurrence(
        { kind: RecurrenceKind.MonthlyDay, interval_months: 3, day: 15 },
        MONDAY_START,
      ),
    ).toBe("2027-01-15");
    // Nth weekday: second Monday; start past it moves to the next
    // eligible month (interval 2 → December's last Friday).
    expect(
      firstOccurrence(
        {
          kind: RecurrenceKind.MonthlyNthWeekday,
          interval_months: 1,
          nth: 2,
          weekday: Weekday.Monday,
        },
        "2026-10-01",
      ),
    ).toBe("2026-10-12");
    expect(
      firstOccurrence(
        {
          kind: RecurrenceKind.MonthlyNthWeekday,
          interval_months: 2,
          nth: -1,
          weekday: Weekday.Friday,
        },
        "2026-10-31", // past October's last Friday (the 30th)
      ),
    ).toBe("2026-12-25");
  });

  it("rejects unusable and unrepresentable schedules", () => {
    expect(
      firstOccurrence(
        {
          kind: RecurrenceKind.Weekly,
          interval_weeks: 0,
          weekdays: [Weekday.Monday],
        },
        "2026-10-19",
      ),
    ).toBeNull();
    expect(
      firstOccurrence(
        { kind: RecurrenceKind.Weekly, interval_weeks: 1, weekdays: [] },
        "2026-10-19",
      ),
    ).toBeNull();
    expect(
      firstOccurrence(
        { kind: RecurrenceKind.WorkdayAfter, day: 15 },
        "2026-10-19",
      ),
    ).toBeNull();
    // 9999-12-31 is a Friday — a Monday-only weekly can only recur in
    // year 10000, outside the four-digit ISO contract.
    expect(
      firstOccurrence(
        {
          kind: RecurrenceKind.Weekly,
          interval_weeks: 1,
          weekdays: [Weekday.Monday],
        },
        "9999-12-31",
      ),
    ).toBeNull();
    expect(
      firstOccurrence(
        { kind: RecurrenceKind.MonthlyDay, interval_months: 1, day: 1 },
        "9999-12-02",
      ),
    ).toBeNull();
  });

  it("pads early years to four digits so string comparisons hold", () => {
    // 0999-01-01 is a Tuesday; the first Wednesday after it must keep its
    // leading zero or "999-…" would sort after a four-digit end date.
    expect(
      firstOccurrence(
        {
          kind: RecurrenceKind.Weekly,
          interval_weeks: 1,
          weekdays: [Weekday.Wednesday],
        },
        "0999-01-01",
      ),
    ).toBe("0999-01-02");
  });
});
