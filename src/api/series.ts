import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { Category, Task, TaskSeries, UpdateSeries } from "./bindings";

export type { TaskSeries };

export const listTaskSeries = () =>
  transport.invoke<TaskSeries[]>(COMMANDS.listTaskSeries);

export const listSeriesInstances = (seriesId: number) =>
  transport.invoke<Task[]>(COMMANDS.listSeriesInstances, { seriesId });

export const listSeriesCategories = (seriesId: number) =>
  transport.invoke<Category[]>(COMMANDS.listSeriesCategories, { seriesId });

export const updateTaskSeries = (seriesId: number, input: UpdateSeries) =>
  transport.invoke<TaskSeries>(COMMANDS.updateTaskSeries, {
    seriesId,
    input,
  });

export const deleteTaskSeries = (seriesId: number) =>
  transport.invoke<void>(COMMANDS.deleteTaskSeries, { seriesId });

export const truncateTaskSeries = (seriesId: number, fromDate: string) =>
  transport.invoke<void>(COMMANDS.truncateTaskSeries, {
    seriesId,
    fromDate,
  });
