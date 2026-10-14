export const STATUS_LABELS = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
} as const;

export const reorderLabel = (title: string) => `Reorder ${title}`;
export const deleteTaskLabel = (title: string) => `Delete ${title}`;

export const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export const TITLE_REQUIRED_MESSAGE = "Task title is required";
export const PROFILE_NAME_REQUIRED_MESSAGE = "Profile name is required";

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
