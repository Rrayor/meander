import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

import type { GlobalThreshold, Profile } from "./bindings";
import { Weekday } from "@/lib/enums";

export type { Profile };

export const MAX_PROFILE_NAME_LENGTH = 100;

export const listProfiles = () =>
  transport.invoke<Profile[]>(COMMANDS.listProfiles);

export const currentProfile = () =>
  transport.invoke<Profile>(COMMANDS.currentProfile);

export const createProfile = (name: string) =>
  transport.invoke<Profile>(COMMANDS.createProfile, { name });

export const renameProfile = (id: number, name: string) =>
  transport.invoke<Profile>(COMMANDS.renameProfile, { id, name });

export const importProfileSettings = (id: number, sourceId: number) =>
  transport.invoke<Profile>(COMMANDS.importProfileSettings, {
    id,
    sourceId,
  });

export const switchProfile = (id: number) =>
  transport.invoke<void>(COMMANDS.switchProfile, { id });

export const weekStart = () => transport.invoke<Weekday>(COMMANDS.weekStart);

export const setWeekStart = (weekday: Weekday) =>
  transport.invoke<void>(COMMANDS.setWeekStart, { weekday });

export const workDays = () => transport.invoke<Weekday[]>(COMMANDS.workDays);

export const setWorkDays = (days: Weekday[]) =>
  transport.invoke<void>(COMMANDS.setWorkDays, { days });

export const globalThreshold = () =>
  transport.invoke<GlobalThreshold>(COMMANDS.globalThreshold);

export const setGlobalThreshold = (
  minutes: number | null,
  color: string | null,
  dayMinutes: Partial<Record<Weekday, number>>,
) =>
  transport.invoke<void>(COMMANDS.setGlobalThreshold, {
    minutes,
    color,
    dayMinutes,
  });
