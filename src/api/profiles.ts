import { invoke } from "@tauri-apps/api/core";

import { COMMANDS } from "@/api/commands";

export interface Profile {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export const listProfiles = () => invoke<Profile[]>(COMMANDS.listProfiles);

export const currentProfile = () => invoke<Profile>(COMMANDS.currentProfile);

export const createProfile = (name: string) =>
  invoke<Profile>(COMMANDS.createProfile, { name });

export const renameProfile = (id: number, name: string) =>
  invoke<Profile>(COMMANDS.renameProfile, { id, name });

export const switchProfile = (id: number) =>
  invoke<void>(COMMANDS.switchProfile, { id });
