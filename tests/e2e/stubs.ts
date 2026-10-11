import type { Page } from "@playwright/test";

type StubValue = unknown;

type InvokeHandlers = Record<string, StubValue>;

// Marks a stubbed command response as a failure — serialized as data so it
// survives addInitScript's argument serialization.
export const stubError = (message: string) => ({ __error: message });

// Returns each value in order on successive invoke calls — for commands the
// UI refetches after a mutation (e.g. lists invalidated by TanStack Query).
export const stubSequence = (values: unknown[]) => ({ __sequence: values });

// Installs an invoke() stub driven by a plain object keyed on COMMANDS
// values. Unstubbed commands fail loudly, same as the base fixture.
export const stubTauriCommands = (page: Page, handlers: InvokeHandlers) =>
  page.addInitScript((stubbed) => {
    (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        if (!(cmd in stubbed)) {
          throw new Error(`unmocked tauri command: ${cmd}`);
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
          "__error" in (value as Record<string, unknown>)
        ) {
          throw new Error((value as { __error: string }).__error);
        }
        return value;
      },
    };
  }, handlers);
