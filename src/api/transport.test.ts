import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import { ApiError, rethrowApiError, transport } from "@/api/transport";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(tauriInvoke);

describe("transport.invoke", () => {
  beforeEach(() => mockedInvoke.mockClear());

  it("returns the command result", async () => {
    mockedInvoke.mockResolvedValue(42);
    await expect(
      transport.invoke<number>("some_command", { a: 1 }),
    ).resolves.toBe(42);
    expect(mockedInvoke).toHaveBeenCalledWith("some_command", { a: 1 });
  });
});

// Error mapping is tested synchronously: vitest's unhandled-rejection
// tracking misfires on mocked rejections that are actually caught.
describe("rethrowApiError", () => {
  it("maps {code, kind, message} rejections to ApiError", () => {
    try {
      rethrowApiError({
        code: "task_title_required",
        kind: "validation",
        message: "backend copy",
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("task_title_required");
      expect((err as ApiError).kind).toBe("validation");
      expect((err as ApiError).message).toBe("backend copy");
    }
  });

  it("rethrows non-typed errors unchanged", () => {
    const boom = new Error("connection lost");
    expect(() => rethrowApiError(boom)).toThrow(boom);
  });

  it("rethrows non-objects and malformed payloads unchanged", () => {
    expect(() => rethrowApiError("oops")).toThrow("oops");
    expect(() => rethrowApiError(null)).toThrow();
    expect(() => rethrowApiError({ code: "x" })).toThrow();
  });
});
