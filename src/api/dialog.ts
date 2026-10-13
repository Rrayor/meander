import { open } from "@tauri-apps/plugin-dialog";

export interface PickFileOptions {
  filters?: { name: string; extensions: string[] }[];
}

/** Opens a native file picker. Returns the selected path, or null when cancelled. */
export function pickFile(options: PickFileOptions): Promise<string | null> {
  return open({ directory: false, ...options });
}
