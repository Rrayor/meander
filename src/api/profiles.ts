import { invoke } from "@tauri-apps/api/core";

export interface Profile {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export const listProfiles = () => invoke<Profile[]>("list_profiles");

export const currentProfile = () => invoke<Profile>("current_profile");
