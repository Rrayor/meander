import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type {
  TaskPlacement,
  TaskStatus,
  CarryOverRule,
  NewTask,
  Task,
  UpdateTask,
} from "./bindings";

export type { NewTask, Task, UpdateTask };

export const listTasks = () => transport.invoke<Task[]>(COMMANDS.listTasks);

export const listWeekTasks = (date: string) =>
  transport.invoke<Task[]>(COMMANDS.listWeekTasks, { date });

export const listPendingCarryOver = () =>
  transport.invoke<Task[]>(COMMANDS.listPendingCarryOver);

export const resolveCarryOver = (taskId: number, rule: CarryOverRule) =>
  transport.invoke<void>(COMMANDS.resolveCarryOver, { taskId, rule });

export const MAX_TASK_TITLE_LENGTH = 200;

// Spec: an estimate is optional, but when present it is a positive value of at
// most 24 hours.
export { MAX_DURATION_MINUTES } from "@/lib/constants";

// Spec: a description is optional and at most 20,000 characters.
export const MAX_TASK_DESCRIPTION_LENGTH = 20_000;

export const createTask = (input: NewTask) =>
  transport.invoke<Task>(COMMANDS.createTask, { input });

export const moveTask = (
  taskId: number,
  beforeId: number | null,
  afterId: number | null,
) =>
  transport.invoke<void>(COMMANDS.moveTask, {
    taskId,
    beforeId,
    afterId,
  });

export const deleteTask = (taskId: number) =>
  transport.invoke<void>(COMMANDS.deleteTask, { taskId });

export const addTaskToWeek = (taskId: number) =>
  transport.invoke<Task>(COMMANDS.addTaskToWeek, { taskId });

export const returnTaskToBacklog = (taskId: number) =>
  transport.invoke<Task>(COMMANDS.returnTaskToBacklog, { taskId });

export const scheduleTask = (taskId: number, date: string) =>
  transport.invoke<Task>(COMMANDS.scheduleTask, { taskId, date });

export const updateTask = (taskId: number, input: UpdateTask) =>
  transport.invoke<Task>(COMMANDS.updateTask, { taskId, input });
export const boardMove = (
  taskId: number,
  placement: TaskPlacement,
  date: string | null,
  status: TaskStatus,
) =>
  transport.invoke<Task>(COMMANDS.boardMove, {
    taskId,
    placement,
    date,
    status,
  });
