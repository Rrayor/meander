import { invoke } from "@tauri-apps/api/core";

import { COMMANDS } from "@/api/commands";

import type { Task } from "./bindings";

export type { Task };

export const listTasks = () => invoke<Task[]>(COMMANDS.listTasks);
