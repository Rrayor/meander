import { COMMANDS } from "@/api/commands";
import { transport } from "@/api/transport";

export const currentDatabasePath = () =>
  transport.invoke<string>(COMMANDS.currentDbPath);

export const selectDatabaseFile = (path: string) =>
  transport.invoke<string>(COMMANDS.selectDatabaseFile, { path });
