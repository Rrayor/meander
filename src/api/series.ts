import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { Category, Task, TaskSeries, UpdateSeries } from "./bindings";

export type { TaskSeries };

export const listTaskSeries = () =>
  transport.invoke<TaskSeries[]>(COMMANDS.listTaskSeries);

export const listSeriesInstances = (seriesId: number) =>
  transport.invoke<Task[]>(COMMANDS.listSeriesInstances, { seriesId });

// Picking a scheduled-but-unpersisted date materializes its instance in
// the background (spec: future-instance editing) — idempotent, so a date
// that already has a row returns it.
export const getOrCreateInstance = (seriesId: number, date: string) =>
  transport.invoke<Task>(COMMANDS.getOrCreateInstance, { seriesId, date });

export const listSeriesCategories = (seriesId: number) =>
  transport.invoke<Category[]>(COMMANDS.listSeriesCategories, { seriesId });

export const updateTaskSeries = (seriesId: number, input: UpdateSeries) =>
  transport.invoke<TaskSeries>(COMMANDS.updateTaskSeries, {
    seriesId,
    input,
  });

export const deleteTaskSeries = (seriesId: number) =>
  transport.invoke<void>(COMMANDS.deleteTaskSeries, { seriesId });

export const updateTaskSeriesFrom = (
  seriesId: number,
  fromDate: string,
  input: UpdateSeries,
) =>
  transport.invoke<TaskSeries>(COMMANDS.updateTaskSeriesFrom, {
    seriesId,
    fromDate,
    input,
  });

export const truncateTaskSeries = (seriesId: number, fromDate: string) =>
  transport.invoke<void>(COMMANDS.truncateTaskSeries, {
    seriesId,
    fromDate,
  });
export const skippedSeriesDates = (seriesId: number) =>
  transport.invoke<string[]>(COMMANDS.skippedSeriesDates, { seriesId });

export const scheduleOccurrence = (
  seriesId: number,
  date: string,
  newDate: string,
) =>
  transport.invoke<Task>(COMMANDS.scheduleOccurrence, {
    seriesId,
    date,
    newDate,
  });
