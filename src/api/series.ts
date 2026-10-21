import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { Task, TaskSeries } from "./bindings";

export type { TaskSeries };

export const listTaskSeries = () =>
  transport.invoke<TaskSeries[]>(COMMANDS.listTaskSeries);

export const listSeriesInstances = (seriesId: number) =>
  transport.invoke<Task[]>(COMMANDS.listSeriesInstances, { seriesId });
