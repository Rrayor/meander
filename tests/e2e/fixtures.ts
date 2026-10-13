import { test as base } from "@playwright/test";

// Mocks the Tauri IPC layer. Any invoke() call that hasn't been explicitly
// stubbed for a command fails loudly so feature tests must declare their
// backend surface instead of silently getting undefined.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      (
        window as unknown as { __TAURI_INTERNALS__: object }
      ).__TAURI_INTERNALS__ = {
        invoke: (cmd: string) =>
          Promise.reject(new Error(`unmocked tauri command: ${cmd}`)),
      };
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
