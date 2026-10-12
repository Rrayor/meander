import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";
import { stubTauriCommands } from "./stubs";

const backlogPath = ROUTES.find((r) => r.label === "Backlog")!.path;

const current = {
  id: 1,
  name: "Default",
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-10 09:14:00",
};

const tasks = [
  {
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
    created_at: "2026-10-10 09:00:00",
    updated_at: "2026-10-10 09:00:00",
  },
  {
    id: 2,
    profile_id: 1,
    title: "Review quarterly milestone planning",
    description: "Flag risks early",
    status: "in_progress",
    carry_over_rule: "carry",
    estimated_minutes: 180,
    spent_minutes: 30,
    placement: "backlog",
    scheduled_date: null,
    created_at: "2026-10-11 10:00:00",
    updated_at: "2026-10-11 10:00:00",
  },
];

test("backlog lists tasks with status and estimate", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: tasks,
    [COMMANDS.currentProfile]: current,
  });
  await page.goto(`/#${backlogPath}`);

  await expect(page.getByText("Draft weekly reflection notes")).toBeVisible();
  await expect(
    page.getByText("Review quarterly milestone planning"),
  ).toBeVisible();
  await expect(page.getByText("45m")).toBeVisible();
  await expect(page.getByText("3h")).toBeVisible();
  await expect(page.getByText("In progress")).toBeVisible();
});

test("an empty backlog shows the empty state", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
  });
  await page.goto(`/#${backlogPath}`);

  await expect(
    page.getByText("No tasks yet — created tasks will appear here."),
  ).toBeVisible();
});
