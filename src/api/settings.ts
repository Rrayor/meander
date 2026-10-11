import { invoke } from "@tauri-apps/api/core";

import { COMMANDS } from "@/api/commands";

export const currentDatabasePath = () => invoke<string>(COMMANDS.currentDbPath);

export const selectDatabaseFile = (path: string) =>
  invoke<string>(COMMANDS.selectDatabaseFile, { path });
