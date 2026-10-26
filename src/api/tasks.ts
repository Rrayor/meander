import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { CarryOverRule, NewTask, Task, UpdateTask } from "./bindings";

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
export const MAX_DURATION_MINUTES = 24 * 60;

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

export const updateTask = (taskId: number, input: UpdateTask) =>
  transport.invoke<Task>(COMMANDS.updateTask, { taskId, input });
