import {
  CarryOverRule,
  RecurrenceKind,
  TaskPlacement,
  TaskStatus,
  Weekday,
} from "@/lib/enums";
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";
import {
  ADD_CATEGORY_LABEL,
  ADD_TASK_LABEL,
  REPEAT_ON_THE_LABEL,
  REPEAT_SECTION_LABEL,
  editCategoryLabel,
  editTaskLabel,
  removeTaskCategoryLabel,
} from "@/lib/labels";

import { STUB_DB_PATH, stubTauriCommands } from "./stubs";

const backlogPath = ROUTES.find((r) => r.label === "Backlog")!.path;
const settingsPath = ROUTES.find((r) => r.label === "Settings")!.path;

const current = {
  id: 1,
  name: "Default",
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-10 09:14:00",
};

const AUDIT_TS = "2026-10-10 09:00:00";

const errands = {
  id: 1,
  profile_id: 1,
  title: "Errands",
  description: null,
  color: "#2DD4BF",
  created_at: AUDIT_TS,
  updated_at: AUDIT_TS,
};

const task = {
  id: 1,
  profile_id: 1,
  title: "Draft weekly reflection notes",
  description: null,
  status: TaskStatus.Todo,
  carry_over_rule: null,
  estimated_minutes: 45,
  spent_minutes: null,
  placement: TaskPlacement.Backlog,
  scheduled_date: null,
  series_id: null,
  sort_order: 1,
  created_at: AUDIT_TS,
  updated_at: AUDIT_TS,
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
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
  });
  await page.goto("/");

  await expectAccessible(page);
});

test("the backlog has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [task],
  });
  await page.goto(`/#${backlogPath}`);
  await expect(page.getByText(task.title)).toBeVisible();

  await expectAccessible(page);
});

test("the new task dialog has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
  });
  await page.goto(`/#${backlogPath}`);
  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await expectAccessible(page);
});

test("the repeat schedule fields have no WCAG AA violations", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
  });
  await page.goto(`/#${backlogPath}`);
  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: new RegExp(REPEAT_SECTION_LABEL) })
    .click();
  await dialog.getByRole("button", { name: "months" }).click();
  await dialog.getByRole("radio", { name: REPEAT_ON_THE_LABEL }).click();
  await dialog.getByRole("button", { name: "Last" }).click();

  await expectAccessible(page);
});

test("the category picker has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [],
    [COMMANDS.listCategories]: [errands],
  });
  await page.goto(`/#${backlogPath}`);
  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").focus();
  await dialog
    .getByRole("option", { name: new RegExp(errands.title) })
    .dispatchEvent("mousedown");
  await expect(
    dialog.getByRole("button", {
      name: removeTaskCategoryLabel(errands.title),
    }),
  ).toBeVisible();
  await dialog.getByRole("combobox").focus();

  await expectAccessible(page);
});

test("the edit task dialog has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [task],
    [COMMANDS.listTaskCategories]: [],
  });
  await page.goto(`/#${backlogPath}`);
  await page.getByRole("button", { name: editTaskLabel(task.title) }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await expectAccessible(page);
});

const seriesFixture = {
  id: 7,
  profile_id: 1,
  title: task.title,
  description: null,
  carry_over_rule: CarryOverRule.Return,
  estimated_minutes: null,
  recurrence: {
    kind: RecurrenceKind.Weekly,
    interval_weeks: 1,
    weekdays: [Weekday.Monday],
  },
  start_date: "2026-10-05",
  end_date: null,
  created_at: AUDIT_TS,
  updated_at: AUDIT_TS,
};

const seriesInstance = {
  ...task,
  series_id: seriesFixture.id,
  scheduled_date: "2026-10-19",
};

test("the task details view has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listTasks]: [seriesInstance],
    [COMMANDS.listTaskCategories]: [],
    [COMMANDS.listTaskSeries]: [seriesFixture],
    [COMMANDS.listSeriesInstances]: [seriesInstance],
  });
  await page.goto(`/#${backlogPath}`);
  await page.getByRole("button", { name: editTaskLabel(task.title) }).click();
  const dialog = page.getByRole("dialog");
  // Series sections rendered — audit line, calendar, notes tabs.
  await expect(dialog.getByText(/Repeats/)).toBeVisible();

  await expectAccessible(page);
});

test("the categories page has no WCAG AA violations", async ({ page }) => {
  const categoriesPath = ROUTES.find((r) => r.label === "Categories")!.path;
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listCategories]: [errands],
  });
  await page.goto(`/#${categoriesPath}`);
  await expectAccessible(page);
});

test("the new category dialog has no WCAG AA violations", async ({ page }) => {
  const categoriesPath = ROUTES.find((r) => r.label === "Categories")!.path;
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listCategories]: [],
  });
  await page.goto(`/#${categoriesPath}`);
  await page.getByRole("button", { name: ADD_CATEGORY_LABEL }).click();
  await expectAccessible(page);
});

test("the edit category dialog has no WCAG AA violations", async ({ page }) => {
  const categoriesPath = ROUTES.find((r) => r.label === "Categories")!.path;
  const category = {
    id: 1,
    profile_id: 1,
    title: "Errands",
    description: "Weekly shopping",
    color: "#4ade80",
    created_at: AUDIT_TS,
    updated_at: AUDIT_TS,
  };
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listCategories]: [category],
  });
  await page.goto(`/#${categoriesPath}`);
  await page
    .getByRole("button", { name: editCategoryLabel(category.title) })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await expectAccessible(page);
});

test("the settings page has no WCAG AA violations", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTaskNotes]: [],
    [COMMANDS.listSeriesNotes]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
  });
  await page.goto(`/#${settingsPath}`);
  await expect(page.getByRole("list").getByText("Default")).toBeVisible();

  await expectAccessible(page);
});
