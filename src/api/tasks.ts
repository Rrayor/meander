import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { NewTask, Task } from "./bindings";

export type { NewTask, Task };

export const listTasks = () => transport.invoke<Task[]>(COMMANDS.listTasks);

export const MAX_TASK_TITLE_LENGTH = 200;

export const createTask = (input: NewTask) =>
  transport.invoke<Task>(COMMANDS.createTask, { input });

export const reorderTasks = (orderedIds: number[]) =>
  transport.invoke<void>(COMMANDS.reorderTasks, { orderedIds });
