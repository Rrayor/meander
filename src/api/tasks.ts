import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { Task } from "./bindings";

export type { Task };

export const listTasks = () => transport.invoke<Task[]>(COMMANDS.listTasks);
