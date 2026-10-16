import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { Category } from "./bindings";

export type { Category };

// Spec: category titles are required and at most 100 characters.
export const MAX_CATEGORY_TITLE_LENGTH = 100;

export const listCategories = () =>
  transport.invoke<Category[]>(COMMANDS.listCategories);

export const listTaskCategories = (taskId: number) =>
  transport.invoke<Category[]>(COMMANDS.listTaskCategories, { taskId });

export const addTaskCategory = (taskId: number, categoryId: number) =>
  transport.invoke<void>(COMMANDS.addTaskCategory, { taskId, categoryId });

export const removeTaskCategory = (taskId: number, categoryId: number) =>
  transport.invoke<void>(COMMANDS.removeTaskCategory, { taskId, categoryId });
