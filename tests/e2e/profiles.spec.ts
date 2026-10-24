import { COMMANDS } from "@/api/commands";
import { Weekday } from "@/lib/enums";
import {
  CANCEL_BUTTON_LABEL,
  CREATE_PROFILE_LABEL,
  PROFILES_HEADING,
  PROFILE_NAME_LABEL,
  PROFILE_NAME_REQUIRED_MESSAGE,
  RENAME_BUTTON_LABEL,
  SAVE_BUTTON_LABEL,
  WEEKDAY_OPTIONS,
  WEEK_START_HEADING,
  WEEK_START_LABEL,
  WORK_DAYS_HEADING,
  renameProfileLabel,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";
import {
  STUB_DB_PATH,
  getInvocations,
  stubApiError,
  stubSequence,
  stubTauriCommands,
} from "./stubs";

const DEFAULT_PROFILE_NAME = "Default";
const WORK_PROFILE_NAME = "Work";
const RENAMED_PROFILE_NAME = "Personal";
const NEW_PROFILE_NAME = "Fieldwork";
const NEW_PROFILE_INPUT = "  Fieldwork  ";

const settingsPath = ROUTES.find((r) => r.label === "Settings")!.path;

const profiles = [
  {
    id: 1,
    name: DEFAULT_PROFILE_NAME,
    created_at: "2026-10-01 08:00:00",
    updated_at: "2026-10-10 09:14:00",
  },
  {
    id: 2,
    name: WORK_PROFILE_NAME,
    created_at: "2026-10-05 12:00:00",
    updated_at: "2026-10-05 12:00:00",
  },
];

test("settings lists profiles and marks the current one", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
  });
  await page.goto(`/#${settingsPath}`);

  const section = page.getByRole("region", { name: PROFILES_HEADING });
  await expect(section.getByText(DEFAULT_PROFILE_NAME)).toBeVisible();
  await expect(section.getByText(WORK_PROFILE_NAME)).toBeVisible();
  await expect(
    section
      .getByRole("listitem")
      .filter({ hasText: DEFAULT_PROFILE_NAME })
      .getByText("Current"),
  ).toBeVisible();
});

test("creating a profile adds it to the list", async ({ page }) => {
  const created = {
    id: 3,
    name: NEW_PROFILE_NAME,
    created_at: "2026-10-12 10:00:00",
    updated_at: "2026-10-12 10:00:00",
  };
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: stubSequence([profiles, [...profiles, created]]),
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.createProfile]: created,
  });
  await page.goto(`/#${settingsPath}`);

  await page.getByLabel(PROFILE_NAME_LABEL).fill(NEW_PROFILE_INPUT);
  await page.getByRole("button", { name: CREATE_PROFILE_LABEL }).click();

  const section = page.getByRole("region", { name: PROFILES_HEADING });
  await expect(section.getByText(NEW_PROFILE_NAME)).toBeVisible();
});

test("a blank name shows validation without calling the backend", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    // createProfile intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${settingsPath}`);

  await page.getByRole("button", { name: CREATE_PROFILE_LABEL }).click();

  await expect(
    page.getByRole("region", { name: PROFILES_HEADING }).getByRole("alert"),
  ).toHaveText(PROFILE_NAME_REQUIRED_MESSAGE);
});

test("renaming a profile updates the list and the footer", async ({ page }) => {
  const renamed = { ...profiles[0], name: RENAMED_PROFILE_NAME };
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: stubSequence([profiles, [renamed, profiles[1]]]),
    [COMMANDS.currentProfile]: stubSequence([profiles[0], renamed]),
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.renameProfile]: renamed,
  });
  await page.goto(`/#${settingsPath}`);

  const section = page.getByRole("region", { name: PROFILES_HEADING });
  await section
    .getByRole("listitem")
    .filter({ hasText: DEFAULT_PROFILE_NAME })
    .getByRole("button", { name: RENAME_BUTTON_LABEL })
    .click();
  await page
    .getByLabel(renameProfileLabel(DEFAULT_PROFILE_NAME))
    .fill(RENAMED_PROFILE_NAME);
  await section.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  await expect(section.getByText(RENAMED_PROFILE_NAME)).toBeVisible();
  await expect(
    page.getByRole("button", { name: RENAMED_PROFILE_NAME }),
  ).toBeVisible();
});

test("cancelling a rename leaves the name unchanged", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    // renameProfile intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${settingsPath}`);

  const section = page.getByRole("region", { name: PROFILES_HEADING });
  await section
    .getByRole("listitem")
    .filter({ hasText: DEFAULT_PROFILE_NAME })
    .getByRole("button", { name: RENAME_BUTTON_LABEL })
    .click();
  await page
    .getByLabel(renameProfileLabel(DEFAULT_PROFILE_NAME))
    .fill(RENAMED_PROFILE_NAME);
  await page.getByRole("button", { name: CANCEL_BUTTON_LABEL }).click();

  await expect(section.getByText(DEFAULT_PROFILE_NAME)).toBeVisible();
  await expect(section.getByText(RENAMED_PROFILE_NAME)).toBeHidden();
});

test("the nav footer switches the active profile", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: stubSequence([profiles[0], profiles[1]]),
    [COMMANDS.switchProfile]: null,
  });
  await page.goto("/");

  const footer = page.getByRole("button", { name: DEFAULT_PROFILE_NAME });
  await footer.click();
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: WORK_PROFILE_NAME })
    .click();

  await expect(
    page.getByRole("button", { name: WORK_PROFILE_NAME }),
  ).toBeVisible();
});

test("saving a week start sends it on the wire", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.weekStart]: Weekday.Monday,
    [COMMANDS.setWeekStart]: undefined,
    [COMMANDS.workDays]: [],
  });
  await page.goto(`/#${settingsPath}`);

  const section = page.getByRole("region", { name: WEEK_START_HEADING });
  const sunday = WEEKDAY_OPTIONS.find((o) => o.value === Weekday.Sunday)!;
  await section.getByLabel(WEEK_START_LABEL).selectOption(sunday.value);
  await section.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  const calls = await getInvocations<{ weekday: string }>(page);
  const saveCall = calls.find((c) => c.cmd === COMMANDS.setWeekStart);
  expect(saveCall?.args).toEqual({ weekday: sunday.value });
  await expect(section.getByLabel(WEEK_START_LABEL)).toHaveValue(sunday.value);
});

test("a failed week-start save surfaces the error", async ({ page }) => {
  const message = "db write failed";
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.weekStart]: Weekday.Monday,
    [COMMANDS.setWeekStart]: stubApiError("internal", "internal", message),
    [COMMANDS.workDays]: [],
  });
  await page.goto(`/#${settingsPath}`);

  const section = page.getByRole("region", { name: WEEK_START_HEADING });
  await section.getByLabel(WEEK_START_LABEL).selectOption(Weekday.Sunday);
  await section.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();
  await expect(section.getByRole("alert")).toHaveText(message);
});

const mondayFriday = WEEKDAY_OPTIONS.slice(0, 5).map((o) => o.value);

test("saving work days sends them on the wire", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.weekStart]: Weekday.Monday,
    [COMMANDS.workDays]: mondayFriday,
    [COMMANDS.setWorkDays]: undefined,
  });
  await page.goto(`/#${settingsPath}`);

  const section = page.getByRole("region", { name: WORK_DAYS_HEADING });
  const friday = WEEKDAY_OPTIONS.find((o) => o.value === Weekday.Friday)!;
  const saturday = WEEKDAY_OPTIONS.find((o) => o.value === Weekday.Saturday)!;
  await section.getByRole("button", { name: friday.label }).click();
  await section.getByRole("button", { name: saturday.label }).click();
  await section.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  const calls = await getInvocations<{ days: string[] }>(page);
  const saveCall = calls.find((c) => c.cmd === COMMANDS.setWorkDays);
  expect(saveCall?.args).toEqual({
    days: mondayFriday.filter((d) => d !== friday.value).concat(saturday.value),
  });
});

test("a failed work-days save surfaces the error", async ({ page }) => {
  const message = "work days write failed";
  await stubTauriCommands(page, {
    [COMMANDS.listProfiles]: profiles,
    [COMMANDS.currentProfile]: profiles[0],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.weekStart]: Weekday.Monday,
    [COMMANDS.workDays]: mondayFriday,
    [COMMANDS.setWorkDays]: stubApiError(
      "work_days_required",
      "validation",
      message,
    ),
  });
  await page.goto(`/#${settingsPath}`);

  const section = page.getByRole("region", { name: WORK_DAYS_HEADING });
  const saturday = WEEKDAY_OPTIONS.find((o) => o.value === Weekday.Saturday)!;
  await section.getByRole("button", { name: saturday.label }).click();
  await section.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();
  await expect(section.getByRole("alert")).toHaveText(message);
});
