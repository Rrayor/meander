import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// Transport seam: all backend calls go through `transport.invoke`. A future
// web build can swap in an HTTP implementation (COMMANDS names map to REST
// routes) without touching any call site.
export interface Transport {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export const transport: Transport = {
  invoke: tauriInvoke,
};
