import { invoke } from "@tauri-apps/api/core";

export const currentDatabasePath = () => invoke<string>("current_db_path");

export const selectDatabaseFile = (path: string) =>
  invoke<string>("select_database_file", { path });
