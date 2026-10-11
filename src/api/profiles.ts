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
