export const STATUS_LABELS = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
} as const;

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
export const CLOSE_LABEL = "Close";
export const CLOSE_DIALOG_LABEL = "Close dialog";
export const HOURS_UNIT_LABEL = "h";
export const MINUTES_UNIT_LABEL = "min";
export const SPENT_HOURS_LABEL = "Spent hours";
export const SPENT_MINUTES_LABEL = "Spent minutes";

export const CARRY_OVER_OPTIONS = [
  { value: "", label: "Ask" },
  { value: "carry", label: "Carry over" },
  { value: "return", label: "Return to backlog" },
] as const;

export const auditTimestampsLabel = (created: string, updated: string) =>
  `Created ${created} · Last updated ${updated}`;

export const renameProfileLabel = (name: string) => `Rename ${name}`;

export const ADD_TASK_LABEL = "Add task";
export const CREATE_TASK_LABEL = "Create task";
export const EMPTY_BACKLOG_MESSAGE =
  "No tasks yet — created tasks will appear here.";
export const ESTIMATED_HOURS_LABEL = "Estimated hours";
export const ESTIMATED_MINUTES_LABEL = "Estimated minutes";

export const PROFILES_HEADING = "Profiles";
export const PROFILE_NAME_LABEL = "Profile name";
export const CREATE_PROFILE_LABEL = "Create profile";
export const CURRENT_PROFILE_LABEL = "Current";
export const RENAME_BUTTON_LABEL = "Rename";
export const SAVE_BUTTON_LABEL = "Save";
export const CANCEL_BUTTON_LABEL = "Cancel";

export const CATEGORIES_HEADING = "Categories";
export const CATEGORIES_SUBTITLE = "Labels for grouping tasks";
export const EMPTY_CATEGORIES_MESSAGE =
  "No categories yet — created categories will appear here.";
export const categoryCreatedLabel = (date: string) => `Created ${date}`;
export const ADD_CATEGORY_LABEL = "Add category";
export const CREATE_CATEGORY_LABEL = "Create category";
export const NEW_CATEGORY_HEADING = "New category";
export const COLOR_FIELD_LABEL = "Color";
export const DEFAULT_COLOR_LABEL = "Default color";
export const CUSTOM_COLOR_LABEL = "Custom color";
export const CATEGORY_TITLE_REQUIRED_MESSAGE = "Category title is required";
export const categorySwatchLabel = (color: string) => `Color ${color}`;
