import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { Category, NewCategory } from "./bindings";

export type { Category, NewCategory };

// Spec: category titles are required and at most 100 characters.
export const MAX_CATEGORY_TITLE_LENGTH = 100;

// Spec: category descriptions are optional and at most 20,000 characters.
export const MAX_CATEGORY_DESCRIPTION_LENGTH = 20_000;

// Spec: no color pick defaults to the primary accent — the backend stores
// this on create, and the UI renders NULL (e.g. seeded rows) the same way.
export const DEFAULT_CATEGORY_COLOR = "#2dd4bf";

// Spec: a category color is optional; the palette mirrors the threshold
// tints in index.css. No pick defaults to the primary accent server-side.
export const CATEGORY_COLORS = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#4ade80",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#818cf8",
  "#a78bfa",
  "#e879f9",
  "#f472b6",
] as const;

export const listCategories = () =>
  transport.invoke<Category[]>(COMMANDS.listCategories);

export const createCategory = (input: NewCategory) =>
  transport.invoke<Category>(COMMANDS.createCategory, { input });

export const deleteCategory = (categoryId: number) =>
  transport.invoke<void>(COMMANDS.deleteCategory, { categoryId });

export const listTaskCategories = (taskId: number) =>
  transport.invoke<Category[]>(COMMANDS.listTaskCategories, { taskId });

export const addTaskCategory = (taskId: number, categoryId: number) =>
  transport.invoke<void>(COMMANDS.addTaskCategory, { taskId, categoryId });

export const removeTaskCategory = (taskId: number, categoryId: number) =>
  transport.invoke<void>(COMMANDS.removeTaskCategory, { taskId, categoryId });
