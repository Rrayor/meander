import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import type { ErrorCode, ErrorKind } from "./bindings";

// Transport seam: all backend calls go through `transport.invoke`. A future
// web build can swap in an HTTP implementation (COMMANDS names map to REST
// routes, and the backend returns the same {code, kind, message} error body)
// without touching any call site.
export interface Transport {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

/** Backend errors arrive as a typed payload; anything else is an unexpected
 * transport failure and is rethrown as-is. */
export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const isApiErrorPayload = (e: unknown): e is ApiError =>
  typeof e === "object" &&
  e !== null &&
  "code" in e &&
  "kind" in e &&
  "message" in e;

export const transport: Transport = {
  invoke: async <T>(command: string, args?: Record<string, unknown>) => {
    try {
      return await tauriInvoke<T>(command, args);
    } catch (e) {
      if (isApiErrorPayload(e)) {
        throw new ApiError(e.code, e.kind, e.message);
      }
      throw e;
    }
  },
};
