import { COMMANDS } from "@/api/commands";
import {
  ADD_TASK_LABEL,
  CREATE_TASK_LABEL,
  SAVE_BUTTON_LABEL,
  deleteTaskLabel,
  editTaskLabel,
  EMPTY_BACKLOG_MESSAGE,
  ESTIMATED_HOURS_LABEL,
  ESTIMATED_MINUTES_LABEL,
  STATUS_LABELS,
  TITLE_REQUIRED_MESSAGE,
  formatMinutes,
  reorderLabel,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";
import {
  getInvocations,
  stubApiError,
  stubSequence,
  stubTauriCommands,
} from "./stubs";

const TITLE_DRAFT_NOTES = "Draft weekly reflection notes";
const TITLE_MILESTONE = "Review quarterly milestone planning";

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
    title: TITLE_DRAFT_NOTES,
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
    title: TITLE_MILESTONE,
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

  await expect(page.getByText(TITLE_DRAFT_NOTES)).toBeVisible();
  await expect(page.getByText(TITLE_MILESTONE)).toBeVisible();
  await expect(page.getByText(formatMinutes(45))).toBeVisible();
  await expect(page.getByText(formatMinutes(180))).toBeVisible();
  await expect(page.getByText(STATUS_LABELS.in_progress)).toBeVisible();
});

test("an empty backlog shows the empty state", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
  });
  await page.goto(`/#${backlogPath}`);

  await expect(page.getByText(EMPTY_BACKLOG_MESSAGE)).toBeVisible();
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

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Title/).fill("  Plan the week  ");
  await dialog.getByLabel(/Description/).fill("Outline priorities");
  await dialog.getByLabel(ESTIMATED_HOURS_LABEL).fill("1");
  await dialog.getByLabel(ESTIMATED_MINUTES_LABEL).fill("30");
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

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

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  await expect(dialog.getByRole("alert")).toHaveText(TITLE_REQUIRED_MESSAGE);
});

test("a blurred title shows validation before submit", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  const title = dialog.getByLabel(/Title/);
  await title.focus();
  await title.blur();

  await expect(dialog.getByRole("alert")).toHaveText(TITLE_REQUIRED_MESSAGE);
});

test("an out-of-range estimate shows validation on blur", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  const hours = dialog.getByLabel(ESTIMATED_HOURS_LABEL);
  await hours.fill("30");
  await hours.blur();

  await expect(dialog.locator("#new-task-estimate-error")).toHaveText(
    /24 hours/,
  );
});

test("the dialog closes on Escape without creating a task", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    // createTask intentionally unstubbed: a call would throw.
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Title/).fill("Abandoned");
  await page.keyboard.press("Escape");

  await expect(dialog).not.toBeVisible();
});

test("the dialog closes on backdrop click and on Cancel", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await page.mouse.click(10, 10); // backdrop, top-left corner
  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
});

test("backend validation errors surface in the dialog", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: stubApiError(
      "task_title_invalid_characters",
      "validation",
      "task title cannot contain control characters",
    ),
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Title/).fill("Trigger backend rejection");
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  await expect(dialog.getByRole("alert")).toHaveText(
    "Task title cannot contain control characters",
  );
  await expect(dialog).toBeVisible(); // dialog stays open for correction
});

test("the estimate pair sends combined minutes on the wire", async ({
  page,
}) => {
  const created = { ...tasks[0], id: 3, estimated_minutes: 90 };
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: stubSequence([[], [created]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.createTask]: created,
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Title/).fill("Timed task");
  await dialog.getByLabel(ESTIMATED_HOURS_LABEL).fill("1");
  await dialog.getByLabel(ESTIMATED_MINUTES_LABEL).fill("30");
  await dialog.getByRole("radio", { name: "Carry over" }).click();
  await dialog.getByRole("button", { name: CREATE_TASK_LABEL }).click();

  const createCall = (await getInvocations(page)).find(
    (c) => c.cmd === COMMANDS.createTask,
  );
  expect(createCall?.args).toEqual({
    input: {
      title: "Timed task",
      description: null,
      estimated_minutes: 90,
      carry_over_rule: "carry",
    },
  });
});

test("minutes alone can exceed the 24-hour limit", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: [],
    [COMMANDS.currentProfile]: current,
  });
  await page.goto(`/#${backlogPath}`);

  await page.getByRole("button", { name: ADD_TASK_LABEL }).click();
  const dialog = page.getByRole("dialog");
  const minutes = dialog.getByLabel(ESTIMATED_MINUTES_LABEL);
  await minutes.fill("1441");
  await minutes.blur();

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
  const source = page.getByLabel(reorderLabel(TITLE_MILESTONE));
  const target = page.getByLabel(reorderLabel(TITLE_DRAFT_NOTES));
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

  await expect(rows.first()).toContainText(TITLE_MILESTONE);
});

test("deleting a task removes it from the backlog", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: stubSequence([tasks, [tasks[1]]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.deleteTask]: null,
  });
  await page.goto(`/#${backlogPath}`);

  await page
    .getByRole("button", { name: deleteTaskLabel(TITLE_DRAFT_NOTES) })
    .click();

  await expect(page.getByText(TITLE_DRAFT_NOTES)).not.toBeVisible();
  await expect(page.getByText(TITLE_MILESTONE)).toBeVisible();

  const deleteCall = (await getInvocations(page)).find(
    (c) => c.cmd === COMMANDS.deleteTask,
  );
  expect(deleteCall?.args).toEqual({ taskId: tasks[0].id });
});

test("editing a task updates the backlog row", async ({ page }) => {
  const updated = {
    ...tasks[0],
    title: TITLE_MILESTONE + " follow-up",
    status: "in_progress",
  };
  await stubTauriCommands(page, {
    [COMMANDS.listTasks]: stubSequence([tasks, [updated, tasks[1]]]),
    [COMMANDS.currentProfile]: current,
    [COMMANDS.updateTask]: updated,
  });
  await page.goto(`/#${backlogPath}`);

  const titleButton = page.getByRole("button", {
    name: editTaskLabel(TITLE_DRAFT_NOTES),
  });
  await expect(titleButton).toHaveCSS("cursor", "pointer");
  await titleButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/Title/)).toHaveValue(TITLE_DRAFT_NOTES);
  await dialog.getByLabel(/Title/).fill(`${TITLE_MILESTONE} follow-up`);
  await dialog.getByRole("radio", { name: STATUS_LABELS.in_progress }).click();
  await dialog.getByRole("button", { name: SAVE_BUTTON_LABEL }).click();

  await expect(page.getByText(`${TITLE_MILESTONE} follow-up`)).toBeVisible();

  const updateCall = (await getInvocations(page)).find(
    (c) => c.cmd === COMMANDS.updateTask,
  );
  expect(updateCall?.args).toEqual({
    taskId: tasks[0].id,
    input: {
      title: `${TITLE_MILESTONE} follow-up`,
      description: null,
      estimated_minutes: 45,
      spent_minutes: null,
      carry_over_rule: null,
      status: "in_progress",
    },
  });
});
