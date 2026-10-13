import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";
import { stubSequence, stubTauriCommands } from "./stubs";

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

test("creating a task via the dialog adds it to the backlog", async ({
  page,
}) => {
  const created = {
    ...tasks[0],
    id: 3,
    title: "Plan the week",
    description: "Outline priorities",
    estimated_minutes: 90,
  };
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: stubSequence([[], [created]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: created,
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Title/).fill("  Plan the week  ");
  await dialog.getByLabel(/Description/).fill("Outline priorities");
  await dialog.getByLabel("Estimated hours").fill("1");
  await dialog.getByLabel("Estimated minutes").fill("30");
  await dialog.getByRole("button", { name: "Create task" }).click();

  await expect(page.getByText("Plan the week")).toBeVisible();
  await expect(dialog).not.toBeVisible();
});

test("a blank title shows validation without calling the backend", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create task" }).click();

  await expect(dialog.getByRole("alert")).toHaveText("Task title is required");
});

test("a blurred title shows validation before submit", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog");
  const title = dialog.getByLabel(/Title/);
  await title.focus();
  await title.blur();

  await expect(dialog.getByRole("alert")).toHaveText("Task title is required");
});

test("an out-of-range estimate shows validation on blur", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog");
  const hours = dialog.getByLabel("Estimated hours");
  await hours.fill("30");
  await hours.blur();

  await expect(dialog.locator("#new-task-estimate-error")).toHaveText(
    /24 hours/,
  );
});

test("dragging a task reorders the backlog", async ({ page }) => {
  const reordered = [tasks[1], tasks[0]];
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: stubSequence([tasks, reordered]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.moveTask]: null,
  });
  await page.goto(`/#${backlogPath}`);

  const rows = page.locator("ul > li");
  const source = page.getByLabel("Reorder Review quarterly milestone planning");
  const target = page.getByLabel("Reorder Draft weekly reflection notes");
  const sourceBox = (await source.boundingBox())!;
  const targetBox = (await target.boundingBox())!;
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 10, {
    steps: 5,
  });
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();

  await expect(rows.first()).toContainText(
    "Review quarterly milestone planning",
  );
});
