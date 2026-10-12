import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";
import { stubSequence, stubTauriCommands } from "./stubs";

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

test("settings lists profiles and marks the current one", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: "/data/meander.db",
  });
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

test("creating a profile adds it to the list", async ({ page }) => {
  const created = {
    id: 3,
    name: "Fieldwork",
    created_at: "2026-10-12 10:00:00",
    updated_at: "2026-10-12 10:00:00",
  };
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: stubSequence([profiles, [...profiles, created]]),
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: "/data/meander.db",
    [COMMANDS.createProfile]: created,
  });
  await page.goto(`/#${settingsPath}`);

  await page.getByLabel("Profile name").fill("  Fieldwork  ");
  await page.getByRole("button", { name: "Create profile" }).click();

  const section = page.getByRole("region", { name: "Profiles" });
  await expect(section.getByText("Fieldwork")).toBeVisible();
});

test("a blank name shows validation without calling the backend", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: "/data/meander.db",
    // createProfile intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${settingsPath}`);

  await page.getByRole("button", { name: "Create profile" }).click();

  await expect(
    page.getByRole("region", { name: "Profiles" }).getByRole("alert"),
  ).toHaveText("Profile name is required");
});

test("the nav footer switches the active profile", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: stubSequence([profiles[0], profiles[1]]),
    [COMMANDS.switchProfile]: null,
  });
  await page.goto("/");

  const footer = page.getByRole("button", { name: "Default" });
  await footer.click();
  await page.getByRole("option", { name: "Work" }).click();

  await expect(page.getByRole("button", { name: "Work" })).toBeVisible();
});
