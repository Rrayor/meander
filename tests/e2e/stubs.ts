import type { Page } from "@playwright/test";

type InvokeHandlers = Record<string, unknown>;

export const STUB_DB_PATH = "/data/meander.db";
export const STUB_OTHER_DB_PATH = "/data/other.db";

// Marks a stubbed command response as a failure — serialized as data so it
// survives addInitScript's argument serialization.
export const stubError = (message: string) => ({ __error: message });

// Marks a stubbed command response as a typed ApiError rejection — the same
// shape the backend puts on the wire, so transport surfaces a real ApiError.
export const stubApiError = (code: string, kind: string, message: string) => ({
  __apiError: { code, kind, message },
});

// Returns each value in order on successive invoke calls — for commands the
// UI refetches after a mutation (e.g. lists invalidated by TanStack Query).
export const stubSequence = (values: unknown[]) => ({ __sequence: values });

// Reads every invoke call recorded by the stub — for asserting the exact
// payload the frontend put on the wire.
export const getInvocations = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __invocations: { cmd: string; args: unknown }[];
        }
      ).__invocations,
  );

// Installs an invoke() stub driven by a plain object keyed on COMMANDS
// values. Unstubbed commands fail loudly, same as the base fixture.
export const stubTauriCommands = (page: Page, handlers: InvokeHandlers) =>
  page.addInitScript((stubbed) => {
    const win = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
      __invocations: { cmd: string; args: unknown }[];
    };
    win.__invocations = [];
    win.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: unknown): Promise<unknown> => {
        win.__invocations.push({ cmd, args });
        if (!(cmd in stubbed)) {
          return Promise.reject(new Error(`unmocked tauri command: ${cmd}`));
        }
        let value = stubbed[cmd];
        if (
          value !== null &&
          typeof value === "object" &&
          "__sequence" in (value as Record<string, unknown>)
        ) {
          const sequence = (value as { __sequence: unknown[] }).__sequence;
          value = sequence.length > 1 ? sequence.shift() : sequence[0];
        }
        if (
          value !== null &&
          typeof value === "object" &&
          "__apiError" in (value as Record<string, unknown>)
        ) {
          return Promise.reject((value as { __apiError: unknown }).__apiError);
        }
        if (
          value !== null &&
          typeof value === "object" &&
          "__error" in (value as Record<string, unknown>)
        ) {
          return Promise.reject(
            new Error((value as { __error: string }).__error),
          );
        }
        return Promise.resolve(value);
      },
    };
  }, handlers);
