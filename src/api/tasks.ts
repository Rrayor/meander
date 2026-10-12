import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { Task } from "./bindings";

export type { Task };

export const listTasks = () => transport.invoke<Task[]>(COMMANDS.listTasks);

export const MAX_TASK_TITLE_LENGTH = 200;

export const createTask = (title: string) =>
  transport.invoke<Task>(COMMANDS.createTask, { title });
