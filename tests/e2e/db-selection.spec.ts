import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";
import { stubError, stubTauriCommands } from "./tauri";

const settingsPath = ROUTES.find((r) => r.label === "Settings")!.path;

test("settings shows the current database and swaps it on selection", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentDbPath]: "/data/meander.db",
    [COMMANDS.dialogOpen]: "/data/other.db",
    [COMMANDS.selectDatabaseFile]: "/data/other.db",
  });
  await page.goto(`/#${settingsPath}`);

  await expect(page.getByText("/data/meander.db")).toBeVisible();
  await page.getByRole("button", { name: "Choose database file" }).click();

  await expect(page.getByText("/data/other.db")).toBeVisible();
});

test("a failed selection shows an error and keeps the current path", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentDbPath]: "/data/meander.db",
    [COMMANDS.dialogOpen]: "/data/other.db",
    [COMMANDS.selectDatabaseFile]: stubError("not a Meander database"),
  });
  await page.goto(`/#${settingsPath}`);

  await page.getByRole("button", { name: "Choose database file" }).click();

  await expect(page.getByRole("alert")).toHaveText("not a Meander database");
  await expect(page.getByText("/data/meander.db")).toBeVisible();
});
