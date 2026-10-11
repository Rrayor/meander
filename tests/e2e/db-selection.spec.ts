import type { Page } from "@playwright/test";

import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";

const settingsPath = ROUTES.find((r) => r.label === "Settings")!.path;

function stubBackend(page: Page, options: { selectError?: string } = {}) {
  return page.addInitScript(
    ({ selectError }) => {
      (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string) => {
          switch (cmd) {
            case "current_db_path":
              return "/data/meander.db";
            case "plugin:dialog|open":
              return "/data/other.db";
            case "select_database_file":
              if (selectError) throw new Error(selectError);
              return "/data/other.db";
            default:
              throw new Error(`unmocked tauri command: ${cmd}`);
          }
        },
      };
    },
    { selectError: options.selectError },
  );
}

test("settings shows the current database and swaps it on selection", async ({
  page,
}) => {
  await stubBackend(page);
  await page.goto(`/#${settingsPath}`);

  await expect(page.getByText("/data/meander.db")).toBeVisible();
  await page.getByRole("button", { name: "Choose database file" }).click();

  await expect(page.getByText("/data/other.db")).toBeVisible();
});

test("a failed selection shows an error and keeps the current path", async ({
  page,
}) => {
  await stubBackend(page, { selectError: "not a Meander database" });
  await page.goto(`/#${settingsPath}`);

  await page.getByRole("button", { name: "Choose database file" }).click();

  await expect(page.getByRole("alert")).toHaveText("not a Meander database");
  await expect(page.getByText("/data/meander.db")).toBeVisible();
});
