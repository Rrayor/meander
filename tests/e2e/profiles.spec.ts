import type { Page } from "@playwright/test";

import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";

const settingsPath = ROUTES.find((r) => r.label === "Settings")!.path;

const profiles = [
  {
    id: 1,
    name: "Default",
    created_at: "2026-10-01 08:00:00",
    updated_at: "2026-10-10 09:14:00",
  },
  {
    id: 2,
    name: "Work",
    created_at: "2026-10-05 12:00:00",
    updated_at: "2026-10-05 12:00:00",
  },
];

function stubBackend(page: Page) {
  return page.addInitScript((stubProfiles) => {
    (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        switch (cmd) {
          case "list_profiles":
            return stubProfiles;
          case "current_profile":
            return stubProfiles[0];
          case "current_db_path":
            return "/data/meander.db";
          default:
            throw new Error(`unmocked tauri command: ${cmd}`);
        }
      },
    };
  }, profiles);
}

test("settings lists profiles and marks the current one", async ({ page }) => {
  await stubBackend(page);
  await page.goto(`/#${settingsPath}`);

  const section = page.getByRole("region", { name: "Profiles" });
  await expect(section.getByText("Default")).toBeVisible();
  await expect(section.getByText("Work")).toBeVisible();
  await expect(
    section
      .getByRole("listitem")
      .filter({ hasText: "Default" })
      .getByText("Current"),
  ).toBeVisible();
});
