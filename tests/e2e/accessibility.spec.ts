import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";
import { ADD_TASK_LABEL, editTaskLabel } from "@/lib/labels";

import { STUB_DB_PATH, stubTauriCommands } from "./stubs";

const backlogPath = ROUTES.find((r) => r.label === "Backlog")!.path;
const settingsPath = ROUTES.find((r) => r.label === "Settings")!.path;

const current = {
  id: 1,
  name: "Default",
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-10 09:14:00",
};

const task = {
  id: 1,
  profile_id: 1,
  title: "Draft weekly reflection notes",
  description: null,
  status: "todo",
  carry_over_rule: null,
  estimated_minutes: 45,
  spent_minutes: null,
  placement: "backlog",
  scheduled_date: null,
  sort_order: 1,
  created_at: "2026-10-10 09:00:00",
  updated_at: "2026-10-10 09:00:00",
};

const expectAccessible = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    violations,
    violations.map((v) => `${v.id}: ${v.help}`).join("\n"),
  ).toEqual([]);
};

test("the board page has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
  });
  await page.goto("/");

  await expectAccessible(page);
});

test("the backlog has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [task],
  });
  await page.goto(`/#${backlogPath}`);
  await expect(page.getByText(task.title)).toBeVisible();

  await expectAccessible(page);
});

test("the new task dialog has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
  });
  await page.goto(`/#${backlogPath}`);
  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await expectAccessible(page);
});

test("the edit task dialog has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [task],
  });
  await page.goto(`/#${backlogPath}`);
  await page.getByRole("button", { name: editTaskLabel(task.title) }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await expectAccessible(page);
});

test("the categories page has no WCAG AA violations", async ({ page }) => {
  const categoriesPath = ROUTES.find((r) => r.label === "Categories")!.path;
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listCategories]: [
      {
        id: 1,
        profile_id: 1,
        title: "Errands",
        description: null,
        color: "#2DD4BF",
        created_at: "2026-10-10 09:00:00",
        updated_at: "2026-10-10 09:00:00",
      },
    ],
  });
  await page.goto(`/#${categoriesPath}`);
  await expectAccessible(page);
});

test("the settings page has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
  });
  await page.goto(`/#${settingsPath}`);
  await expect(page.getByRole("list").getByText("Default")).toBeVisible();

  await expectAccessible(page);
});
