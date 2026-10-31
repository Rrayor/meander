import type { Recurrence } from "@/api/bindings";

import {
  CarryOverRule,
  RepeatNth,
  RepeatUnit,
  TaskSort,
  TaskStatus,
  Weekday,
} from "@/lib/enums";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.Todo]: "Todo",
  [TaskStatus.InProgress]: "In progress",
  [TaskStatus.Done]: "Done",
};

export const reorderLabel = (title: string) => `Reorder ${title}`;
export const deleteTaskLabel = (title: string) => `Delete ${title}`;
export const editTaskLabel = (title: string) => `Edit ${title}`;

export const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export const TITLE_REQUIRED_MESSAGE = "Task title is required";
export const PROFILE_NAME_REQUIRED_MESSAGE = "Profile name is required";

export const NEW_TASK_HEADING = "New task";
export const EDIT_TASK_HEADING = "Edit task";
export const TITLE_FIELD_LABEL = "Title";
export const DESCRIPTION_FIELD_LABEL = "Description";
export const OPTIONAL_FIELD_LABEL = "(optional)";
export const ESTIMATED_TIME_LABEL = "Estimated time";
export const SPENT_TIME_LABEL = "Time spent";
export const TASK_STATUS_FIELD_LABEL = "Status";
export const CARRY_OVER_FIELD_LABEL = "Carry-over rule";
export const NAV_LABEL = "Main Navigation";
export const CLOSE_LABEL = "Close";
export const CLOSE_DIALOG_LABEL = "Close dialog";
export const HOURS_UNIT_LABEL = "h";
export const MINUTES_UNIT_LABEL = "min";
export const SPENT_HOURS_LABEL = "Spent hours";
export const SPENT_MINUTES_LABEL = "Spent minutes";

export const CARRY_OVER_OPTIONS = [
  { value: CarryOverRule.Ask, label: "Ask" },
  { value: CarryOverRule.Carry, label: "Carry over" },
  { value: CarryOverRule.Return, label: "Return to backlog" },
] as const;

export const auditTimestampsLabel = (created: string, updated: string) =>
  `Created ${created} · Last updated ${updated}`;

export const IMPORT_SETTINGS_LABEL = "Import settings from…";
export const renameProfileLabel = (name: string) => `Rename ${name}`;

export const ADD_TASK_LABEL = "Add task";
export const PAGE_SIZE = 50;
export const PAGINATION_LABEL = "Pagination";
export const PAGINATION_PREVIOUS_LABEL = "Previous page";
export const PAGINATION_NEXT_LABEL = "Next page";
export const pageXOfYLabel = (page: number, count: number) =>
  `Page ${page} of ${count}`;
export const ADD_TO_WEEK_LABEL = "Add to current week";
export const MOVE_TO_BACKLOG_LABEL = "Move to backlog";
export const MOVE_TO_DATE_LABEL = "Move to date";
export const DATE_FIELD_LABEL = "Date";
export const addToWeekLabel = (title: string) =>
  `${ADD_TO_WEEK_LABEL}: ${title}`;
export const CREATE_TASK_LABEL = "Create task";
export const EMPTY_BACKLOG_MESSAGE =
  "No tasks yet — created tasks will appear here.";
export const ESTIMATED_HOURS_LABEL = "Estimated hours";
export const ESTIMATED_MINUTES_LABEL = "Estimated minutes";

export const PROFILES_HEADING = "Profiles";
export const PROFILE_NAME_LABEL = "Profile name";
export const CREATE_PROFILE_LABEL = "Create profile";
export const CURRENT_PROFILE_LABEL = "Current";
export const EDIT_BUTTON_LABEL = "Edit";
export const SAVE_BUTTON_LABEL = "Save";
export const DELETE_PROFILE_HEADING = "Delete profile";
export const DELETE_PROFILE_WARNING =
  "This permanently deletes the profile along with all of its tasks and settings.";
export const DELETE_CONFIRM_INPUT_LABEL = "Type the sentence above to confirm";
export const deleteProfileLabel = (name: string) => `Delete ${name}`;
export const deleteProfileSentence = (name: string) =>
  `DELETE ${name} AND ALL ACCOMPANYING DATA`;
export const CANCEL_BUTTON_LABEL = "Cancel";
// Placeholder shown where a task detail has no value.
export const EMPTY_VALUE_LABEL = "—";

export const CATEGORIES_HEADING = "Categories";
export const CATEGORIES_SUBTITLE = "Labels for grouping tasks";
export const EMPTY_CATEGORIES_MESSAGE =
  "No categories yet — created categories will appear here.";
export const categoryCreatedLabel = (date: string) => `Created ${date}`;
export const deleteCategoryLabel = (title: string) => `Delete ${title}`;
export const editCategoryLabel = (title: string) => `Edit ${title}`;
export const EDIT_CATEGORY_HEADING = "Edit category";
export const ADD_CATEGORY_LABEL = "Add category";
export const CREATE_CATEGORY_LABEL = "Create category";
export const NEW_CATEGORY_HEADING = "New category";
export const COLOR_FIELD_LABEL = "Color";
export const DEFAULT_COLOR_LABEL = "Default color";
export const CUSTOM_COLOR_LABEL = "Custom color";
export const CUSTOM_COLOR_PICKER_LABEL = "Pick a custom color";
// Rainbow swatch previewing the "custom" option across palette and
// threshold pickers alike.
export const CUSTOM_COLOR_GRADIENT =
  "conic-gradient(#f87171, #fbbf24, #4ade80, #22d3ee, #a78bfa, #f472b6, #f87171)";
export const CATEGORY_TITLE_REQUIRED_MESSAGE = "Category title is required";
export const categorySwatchLabel = (color: string) => `Color ${color}`;
export const CATEGORIES_FIELD_LABEL = "Categories";
export const CATEGORY_SEARCH_LABEL = "Search or add category";
export const createCategoryOptionLabel = (title: string) => `Create "${title}"`;
export const removeTaskCategoryLabel = (title: string) => `Remove ${title}`;

export const REPEAT_SECTION_LABEL = "Repeat";
export const REPEAT_NONE_SUMMARY = "Does not repeat";
export const REPEAT_EVERY_LABEL = "Every";
export const REPEAT_ON_LABEL = "On";
export const REPEAT_ON_DAY_LABEL = "On day";
export const REPEAT_DAY_OF_MONTH_LABEL = "Day of month";
export const REPEAT_ON_THE_LABEL = "On the";
export const REPEAT_STARTS_LABEL = "Starts";
export const REPEAT_ENDS_LABEL = "Ends";
export const REPEAT_ENDS_ADD_LABEL = "Add end date";
export const REPEAT_ENDS_CLEAR_LABEL = "Remove end date";
export const REPEAT_MONTHLY_CLAMP_HINT =
  "Days past the end of a shorter month land on its last day.";
export const REPEAT_STARTS_REQUIRED_MESSAGE =
  "A repeat schedule needs a start date.";
export const REPEAT_STARTS_INVALID_MESSAGE = "Starts must be a real date.";
export const REPEAT_ENDS_INVALID_MESSAGE = "Ends must be a real date.";
export const REPEAT_ENDS_BEFORE_START_MESSAGE =
  "Ends must not be before Starts.";
export const REPEAT_ENDS_NO_OCCURRENCE_MESSAGE =
  "The schedule never occurs on or before this date.";
export const REPEAT_UNIT_OPTIONS = [
  { value: RepeatUnit.Day, label: "days" },
  { value: RepeatUnit.Week, label: "weeks" },
  { value: RepeatUnit.Month, label: "months" },
] as const;
// Canonical weekday order — Monday first, matching the backend `Weekday`
// enum. Recurrence math (recurrence.ts) indexes weekdays by this order, so
// it must never be rotated for display: the week-start setting rotates a
// derived copy at render time instead.
export const WEEKDAY_OPTIONS = [
  { value: Weekday.Monday, label: "Monday", short: "Mo" },
  { value: Weekday.Tuesday, label: "Tuesday", short: "Tu" },
  { value: Weekday.Wednesday, label: "Wednesday", short: "We" },
  { value: Weekday.Thursday, label: "Thursday", short: "Th" },
  { value: Weekday.Friday, label: "Friday", short: "Fr" },
  { value: Weekday.Saturday, label: "Saturday", short: "Sa" },
  { value: Weekday.Sunday, label: "Sunday", short: "Su" },
] as const;
export const REPEAT_NTH_OPTIONS = [
  { value: RepeatNth.First, label: "1st", aria: "First" },
  { value: RepeatNth.Second, label: "2nd", aria: "Second" },
  { value: RepeatNth.Third, label: "3rd", aria: "Third" },
  { value: RepeatNth.Fourth, label: "4th", aria: "Fourth" },
  { value: RepeatNth.Last, label: "Last", aria: "Last" },
] as const;

export const seriesAuditLabel = (
  description: string,
  start: string,
  end: string | null,
  created: string,
  updated: string,
) => {
  const range = end === null ? "with no end date" : `until ${end}`;
  return `Repeats ${description} from ${start} ${range} — series created ${created} · last updated ${updated}`;
};

export const workdayAfterLabel = (day: number) =>
  `the first workday after day ${day}`;

const weekdayLabel = (value: string) =>
  WEEKDAY_OPTIONS.find((w) => w.value === value)?.label ?? value;

const UNIT_LABELS = Object.fromEntries(
  REPEAT_UNIT_OPTIONS.map((o) => [o.value, o.label]),
) as Record<RepeatUnit, string>;

const andJoin = (items: string[]) =>
  items.length <= 2
    ? items.join(" and ")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// Human-readable schedule description for the series audit line, e.g.
// "every 2 weeks on Monday and Friday".
export const describeRecurrence = (recurrence: Recurrence): string => {
  const cadence = (interval: number, unit: string) =>
    interval === 1 ? `every ${unit.slice(0, -1)}` : `every ${interval} ${unit}`;
  // The discriminant is the specta wire union — matching its literal
  // members is the only way to narrow the recurrence variants.
  switch (recurrence.kind) {
    case "daily":
      return cadence(recurrence.interval_days, UNIT_LABELS[RepeatUnit.Day]);
    case "weekly": {
      const days = andJoin(recurrence.weekdays.map(weekdayLabel));
      return `${cadence(recurrence.interval_weeks, UNIT_LABELS[RepeatUnit.Week])} on ${days}`;
    }
    case "monthly_day":
      return `${cadence(recurrence.interval_months, UNIT_LABELS[RepeatUnit.Month])} on day ${recurrence.day}`;
    case "monthly_nth_weekday": {
      const nth = REPEAT_NTH_OPTIONS.find(
        (o) => o.value === recurrence.nth,
      )?.aria;
      return `${cadence(recurrence.interval_months, UNIT_LABELS[RepeatUnit.Month])} on the ${nth} ${weekdayLabel(recurrence.weekday)}`;
    }
    case "workday_after":
      return workdayAfterLabel(recurrence.day);
  }
};

export const TASK_SCOPE_GROUP_LABEL = "Apply changes to";
export const TASK_SCOPE_INSTANCE_LABEL = "This instance only";
export const TASK_SCOPE_SERIES_LABEL = "Entire series";
export const TASK_SCOPE_FUTURE_LABEL = "This and future instances";

export const DELETE_BUTTON_LABEL = "Delete";
export const DELETE_TASK_HEADING = "Delete task";
export const DELETE_SCOPE_FUTURE_LABEL = "This and all future instances";
export const DELETE_UNDO_WARNING = "This cannot be undone.";
export const DELETE_KEEP_LABEL = "Keep task";

export const CALENDAR_PREVIOUS_LABEL = "Previous month";
export const CALENDAR_NEXT_LABEL = "Next month";

export const WEEK_START_HEADING = "Scheduling";
export const WEEK_START_LABEL = "Week starts on";
export const WORK_DAYS_HEADING = "Work days";
export const WORK_DAYS_HEADING_ID = "work-days-heading";
export const WEEK_START_HEADING_ID = "week-start-heading";
export const WORK_DAYS_FIELD_LABEL = "Days that count as work days";
// Spec: work days default to Monday-Friday; used as the pre-load display.
export const WORK_DAYS_DEFAULT: readonly Weekday[] = [
  Weekday.Monday,
  Weekday.Tuesday,
  Weekday.Wednesday,
  Weekday.Thursday,
  Weekday.Friday,
];

/// Weekday options rotated to start on `weekStart` — a derived copy; the
/// canonical WEEKDAY_OPTIONS stays Monday-first. Used by calendar headers
/// and weekday pickers so the week-start setting is display-only.
export const weekdaysFrom = (weekStart: Weekday) => {
  const i = WEEKDAY_OPTIONS.findIndex((o) => o.value === weekStart);
  const start = Math.max(i, 0);
  return [...WEEKDAY_OPTIONS.slice(start), ...WEEKDAY_OPTIONS.slice(0, start)];
};
export const CALENDAR_LEGEND_PERSISTED = "recorded instance";
export const CALENDAR_LEGEND_SCHEDULED = "scheduled";
export const NOTES_TAB_INSTANCE_LABEL = "Current instance";
export const NOTES_TAB_SERIES_LABEL = "Series";
export const NOTES_SECTION_LABEL = "Notes";
export const NOTES_EMPTY_MESSAGE = "No notes yet.";
export const NOTE_COMPOSER_PLACEHOLDER = "Add a note…";
export const NOTE_ADD_LABEL = "Add note";
export const NOTE_EDITED_PREFIX = "edited";
// Icon-button affordances identify the note by its opening words.
export const noteEditLabel = (opening: string) => `Edit note “${opening}”`;
export const noteDeleteLabel = (opening: string) => `Delete note “${opening}”`;
export const noteConfirmDeleteLabel = (opening: string) =>
  `Confirm deleting note “${opening}”`;
export const NOTE_SAVE_LABEL = "Save note";
export const NOTE_DELETE_CONFIRM_MESSAGE = "Delete this note?";
export const NOTE_EDIT_LABEL = "Edit";
export const NOTE_DELETE_LABEL = "Delete";
export const SCHEDULED_INSTANCE_PENDING_MESSAGE =
  "Scheduled — this instance will be created when the board is generated.";
export const INSTANCE_MATERIALIZING_MESSAGE = "Opening this instance…";

export const TASK_CARD_LABEL = (title: string) => `Task: ${title}`;
export const BOARD_HEADING = "Board";
export const WEEKLY_BACKLOG_LABEL = "Weekly backlog";
export const BOARD_PREVIOUS_WEEK_LABEL = "Previous week";
export const BOARD_NEXT_WEEK_LABEL = "Next week";
export const BOARD_SAVING_LABEL = "Saving move…";
export const BOARD_THIS_WEEK_LABEL = "This week";
export const BOARD_JUMP_HINT_LABEL = "Pick a day to show that week's board";
export const CARRY_OVER_TITLE = "Week started — unfinished tasks";
export const CARRY_OVER_HINT =
  "Incomplete tasks from past weeks need a carry-over decision.";
export const CARRY_OVER_CARRY_LABEL = "Carry over";
export const CARRY_OVER_RETURN_LABEL = "Backlog";
export const CARRY_OVER_APPLY_LABEL = "Apply decisions";
export const CARRY_OVER_DISMISS_LABEL = "Dismiss";
export const CARRY_OVER_DEFER_LABEL = "Decide later";
export const CATEGORY_THRESHOLDS_HEADING = "Category thresholds";
export const CATEGORY_THRESHOLDS_HEADING_ID = "category-thresholds-heading";
export const CATEGORY_THRESHOLDS_HINT =
  "Each category may carry its own per-day minutes limit and color.";
export const thresholdColorLabel = (title: string) =>
  `Threshold minutes for ${title}`;
export const categoryThresholdDayLabel = (title: string, day: string) =>
  `${day} threshold minutes for ${title}`;
export const THRESHOLD_HEADING = "Planning threshold";
export const THRESHOLD_HEADING_ID = "threshold-heading";
export const THRESHOLD_FIELD_LABEL = "Minutes per day";
export const THRESHOLD_COLOR_LABEL = "Threshold color";
export const THRESHOLD_CUSTOM_COLOR_LABEL = "Custom color";
export const THRESHOLD_MINUTES_ERROR_ID = "threshold-minutes-error";
export const THRESHOLD_DAYS_FIELDSET_LABEL = "Per-day overrides";
export const THRESHOLD_DAYS_ERROR_ID = "threshold-days-error";
export const THRESHOLD_HINT =
  "When a day's estimated total reaches the threshold, the board column gets a background tint.";
export const THRESHOLD_CLEAR_LABEL = "Clear threshold";
// The design system's threshold-red, lowercased to match native
// <input type="color"> normalization.
export const THRESHOLD_COLOR_DEFAULT = "#f87171";
export const taskCountLabel = (count: number) =>
  `${count} ${count === 1 ? "task" : "tasks"}`;
export const dayTotalsLabel = (estimated: number, spent: number) =>
  `${formatMinutes(estimated)} est · ${formatMinutes(spent)} spent`;
// Short date like "Oct 20" — board column headers and the week range.
export const shortDateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
export const boardWeekRangeLabel = (start: string, end: string) =>
  `${shortDateLabel(start)} – ${shortDateLabel(end)}`;
// Short weekday like "Mon" — board column headers.
export const shortWeekdayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
  });
export const SEARCH_TASKS_LABEL = "Search tasks";
export const SORT_TASKS_LABEL = "Sort by";
export const FILTER_CATEGORY_LABEL = "Filter by category";
export const TASK_SORT_LABELS: Record<TaskSort, string> = {
  [TaskSort.Manual]: "Manual order",
  [TaskSort.Title]: "Title",
  [TaskSort.Created]: "Created",
  [TaskSort.Updated]: "Recently updated",
};
