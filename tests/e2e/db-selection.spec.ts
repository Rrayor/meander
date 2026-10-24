import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";
import {
  STUB_DB_PATH,
  STUB_OTHER_DB_PATH,
  stubError,
  stubSequence,
  stubTauriCommands,
} from "./stubs";

const SELECTION_ERROR_MESSAGE = "not a Meander database";

const settingsPath = ROUTES.find((r) => r.label === "Settings")!.path;

test("settings shows the current database and swaps it on selection", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    // The switch refetches dbPath — the second call answers the new path.
    [COMMANDS.currentDbPath]: stubSequence([STUB_DB_PATH, STUB_OTHER_DB_PATH]),
    [COMMANDS.dialogOpen]: STUB_OTHER_DB_PATH,
    [COMMANDS.selectDatabaseFile]: STUB_OTHER_DB_PATH,
  });
  await page.goto(`/#${settingsPath}`);

  await expect(page.getByText(STUB_DB_PATH)).toBeVisible();
  await page.getByRole("button", { name: "Choose database file" }).click();

  await expect(page.getByText(STUB_OTHER_DB_PATH)).toBeVisible();
});

test("a failed selection shows an error and keeps the current path", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.dialogOpen]: STUB_OTHER_DB_PATH,
    [COMMANDS.selectDatabaseFile]: stubError(SELECTION_ERROR_MESSAGE),
  });
  await page.goto(`/#${settingsPath}`);

  await page.getByRole("button", { name: "Choose database file" }).click();

  await expect(page.getByRole("alert")).toHaveText(SELECTION_ERROR_MESSAGE);
  await expect(page.getByText(STUB_DB_PATH)).toBeVisible();
});
