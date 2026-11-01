import {
  ADD_TASK_LABEL,
  CALENDAR_NEXT_LABEL,
  NAV_LABEL,
  CREATE_TASK_LABEL,
  DELETE_BUTTON_LABEL,
  EDIT_BUTTON_LABEL,
  SCHEDULED_INSTANCE_PENDING_MESSAGE,
  TASK_SCOPE_SERIES_LABEL,
  editTaskLabel,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

// Transitional selector: migrated dialogs render as portaled
// div[role='dialog'] popups while unmigrated ones stay native
// <dialog open> — the union matches either. Scope into it with :is().
const OPEN_DIALOG = "dialog, [role='dialog']";

// Real end-to-end path: editing a scheduled-but-unpersisted date goes
// through get_or_create_instance IPC and SQLite — the Edit click is what
// materializes the row, and the dialog must enter edit mode on it.
describe("Series instance smoke", () => {
  it("materializes a scheduled-only date on edit intent", async () => {
    const taskTitle = `Smoke series ${Date.now()}`;

    const nav = await $(`aria/${NAV_LABEL}`);
    const backlogRoute = ROUTES.find(({ label }) => label === "Backlog")!;
    await nav.$(`=${backlogRoute.label}`).click();

    await (await $(`aria/${ADD_TASK_LABEL}`)).click();
    await (await $("#new-task-title-input")).setValue(taskTitle);
    // Expanding the repeat section emits a daily schedule by default, so
    // tomorrow is a scheduled-but-unpersisted occurrence.
    await (
      await $(`:is(${OPEN_DIALOG}) button[aria-controls$='-repeat-panel']`)
    ).click();
    await (await $(`aria/${CREATE_TASK_LABEL}`)).click();
    await browser.waitUntil(async () =>
      (await $(`aria/${editTaskLabel(taskTitle)}`)).isExisting(),
    );

    await (await $(`aria/${editTaskLabel(taskTitle)}`)).click();
    const dialog = "dialog[open]";

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pick = `${tomorrow.getFullYear()}-${String(
      tomorrow.getMonth() + 1,
    ).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    // When tomorrow falls into the next month, navigate the grid first.
    if (!(await $(`${dialog} button[aria-label='${pick}']`).isExisting())) {
      await $(`${dialog} button[aria-label='${CALENDAR_NEXT_LABEL}']`).click();
    }
    await (await $(`${dialog} button[aria-label='${pick}']`)).click();

    // The pending placeholder shows until the Edit click materializes
    // the instance; a future date opens straight into edit mode.
    // `*=` only matches link elements — the notice is a paragraph.
    await browser.waitUntil(async () =>
      (
        await $(dialog).$(
          `.//p[contains(., "${SCHEDULED_INSTANCE_PENDING_MESSAGE}")]`,
        )
      ).isExisting(),
    );
    const dialogEl = await $(dialog);
    const editButton = await dialogEl.$(`aria/${EDIT_BUTTON_LABEL}`);
    await expect(editButton).toExist();
    await editButton.click();
    await expect(await dialogEl.$("#edit-task-title-input")).toExist();

    // Cleanup: delete the whole series through the real backend. The
    // delete affordance lives in the read-only view, so reopen the dialog.
    await browser.keys("Escape");
    // The materialized instance also lists in the backlog with the same
    // title — either row opens a series-instance dialog for the cleanup.
    const rows = await $$(`aria/${editTaskLabel(taskTitle)}`);
    await rows[0].click();
    const reopened = await $(dialog);
    const deleteButtons = await reopened.$$(`aria/${DELETE_BUTTON_LABEL}`);
    await deleteButtons[0].click();
    await (await $(`aria/${TASK_SCOPE_SERIES_LABEL}`)).click();
    const confirmButtons = await reopened.$$(`aria/${DELETE_BUTTON_LABEL}`);
    await confirmButtons[confirmButtons.length - 1].click();
    await browser.waitUntil(
      async () => !(await $(`aria/${editTaskLabel(taskTitle)}`).isExisting()),
    );
  });
});
