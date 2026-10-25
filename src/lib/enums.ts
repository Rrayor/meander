// Closed option sets for app code. Member values match the specta wire
// literals, so members are assignable to the generated union types and
// serialize without conversion; values read back from generated types are
// cast once at the boundary (e.g. `task.status as TaskStatus`).

export enum TaskStatus {
  Todo = "todo",
  InProgress = "in_progress",
  Done = "done",
}

export enum CarryOverRule {
  // Ask is a form-level sentinel (empty string) — the wire stores null.
  Ask = "",
  Carry = "carry",
  Return = "return",
}

/// The week-start prompt's three per-task outcomes (spec §79/§356).
/// Carry/Return serialize to the wire's CarryOverRule; Dismiss deletes
/// the task instead — it never crosses the wire as a rule.
export enum CarryOverDecision {
  Carry = "carry",
  Return = "return",
  Dismiss = "dismiss",
}

export const carryOverToWire = (rule: CarryOverRule) =>
  rule === CarryOverRule.Ask ? null : (rule as "carry" | "return");

export enum TaskPlacement {
  Backlog = "backlog",
  WeeklyBacklog = "weekly_backlog",
  Scheduled = "scheduled",
}

export enum Weekday {
  Monday = "monday",
  Tuesday = "tuesday",
  Wednesday = "wednesday",
  Thursday = "thursday",
  Friday = "friday",
  Saturday = "saturday",
  Sunday = "sunday",
}

export enum RecurrenceKind {
  Daily = "daily",
  Weekly = "weekly",
  MonthlyDay = "monthly_day",
  MonthlyNthWeekday = "monthly_nth_weekday",
  WorkdayAfter = "workday_after",
}

export enum RepeatUnit {
  Day = "day",
  Week = "week",
  Month = "month",
}

export enum MonthMode {
  Day = "day",
  Weekday = "weekday",
}

export enum RepeatNth {
  First = 1,
  Second = 2,
  Third = 3,
  Fourth = 4,
  Last = -1,
}

// Shared by save and delete scopes.
export enum TaskScope {
  Instance = "instance",
  Series = "series",
  Future = "future",
}

export type SaveScope = TaskScope;

export enum DialogMode {
  View = "view",
  Edit = "edit",
}

export enum NotesTab {
  Instance = "instance",
  Series = "series",
}
