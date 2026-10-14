import type { ErrorCode } from "@/api/bindings";
import {
  MAX_DURATION_MINUTES,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_TITLE_LENGTH,
} from "@/api/tasks";
import { ApiError } from "@/api/transport";
import { TITLE_REQUIRED_MESSAGE } from "@/lib/labels";

export const DURATION_RANGE_MESSAGE = `Estimated time must be between 1 minute and ${
  MAX_DURATION_MINUTES / 60
} hours`;

export const SPENT_RANGE_MESSAGE = `Spent time must be between 1 minute and ${
  MAX_DURATION_MINUTES / 60
} hours`;

export const TASK_TITLE_TOO_LONG_MESSAGE = `Task title must be ${MAX_TASK_TITLE_LENGTH} characters or fewer`;

export const TASK_DESCRIPTION_TOO_LONG_MESSAGE = `Description must be ${MAX_TASK_DESCRIPTION_LENGTH.toLocaleString()} characters or fewer`;

export const SERVER_ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  task_title_required: TITLE_REQUIRED_MESSAGE,
  task_title_too_long: TASK_TITLE_TOO_LONG_MESSAGE,
  task_title_invalid_characters: "Task title cannot contain control characters",
  estimated_time_out_of_range: DURATION_RANGE_MESSAGE,
  spent_time_out_of_range: SPENT_RANGE_MESSAGE,
  task_description_too_long: TASK_DESCRIPTION_TOO_LONG_MESSAGE,
};

export const serverErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof ApiError) {
    return SERVER_ERROR_MESSAGES[error.code] ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return undefined;
};
