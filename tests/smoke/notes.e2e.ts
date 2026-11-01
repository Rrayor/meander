import {
  ADD_TASK_LABEL,
  CLOSE_LABEL,
  CREATE_TASK_LABEL,
  NAV_LABEL,
  NOTE_ADD_LABEL,
  NOTE_COMPOSER_PLACEHOLDER,
  noteDeleteLabel,
  noteConfirmDeleteLabel,
  deleteTaskLabel,
  editTaskLabel,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

// Real end-to-end path: writing a note on a task goes through
// create_task_note / list_task_notes IPC and SQLite, so the note must
// survive a reopen of the task's details view.
describe("Task notes smoke", () => {
  it("creates, reads, and deletes a note through the real backend", async () => {
    const nav = await $(`aria/${NAV_LABEL}`);
    const backlogRoute = ROUTES.find(({ label }) => label === "Backlog")!;
    await nav.$(`=${backlogRoute.label}`).click();
    await (await $(`aria/${ADD_TASK_LABEL}`)).click();

    const taskTitle = `Smoke notes task ${Date.now()}`;
    await (await $("#new-task-title-input")).setValue(taskTitle);
    await (await $(`aria/${CREATE_TASK_LABEL}`)).click();
    await browser.waitUntil(async () =>
      (await $(`aria/${editTaskLabel(taskTitle)}`)).isExisting(),
    );

    // Details view opens read-only; notes live there, not behind Edit.
    await (await $(`aria/${editTaskLabel(taskTitle)}`)).click();
    const noteBody = `Smoke note ${Date.now()}`;
    await (await $(`aria/${NOTE_COMPOSER_PLACEHOLDER}`)).setValue(noteBody);
    await (await $(`aria/${NOTE_ADD_LABEL}`)).click();
    await browser.waitUntil(async () =>
      (await $(`aria/${noteDeleteLabel(noteBody.slice(0, 30))}`)).isExisting(),
    );
    await expect(
      await $(`aria/${noteDeleteLabel(noteBody.slice(0, 30))}`),
    ).toExist();

    // Reopen the task: the persisted note must render. aria/ matches
    // document-wide and "Close" also hits the backdrop's "Close dialog",
    // so match the exact aria-label inside the open dialog instead.
    const closeDialog = async () =>
      (
        await $(
          `:is(dialog, [role='dialog']) button[aria-label='${CLOSE_LABEL}']`,
        )
      ).click();
    await closeDialog();
    await (await $(`aria/${editTaskLabel(taskTitle)}`)).click();
    await browser.waitUntil(async () =>
      (await $(`aria/${noteDeleteLabel(noteBody.slice(0, 30))}`)).isExisting(),
    );
    await expect(
      await $(`aria/${noteDeleteLabel(noteBody.slice(0, 30))}`),
    ).toExist();

    // Cleanup: delete the note (with confirmation) and the task through the
    // real backend.
    await (await $(`aria/${noteDeleteLabel(noteBody.slice(0, 30))}`)).click();
    await (
      await $(`aria/${noteConfirmDeleteLabel(noteBody.slice(0, 30))}`)
    ).click();
    await browser.waitUntil(
      async () =>
        !(await $(
          `aria/${noteDeleteLabel(noteBody.slice(0, 30))}`,
        ).isExisting()),
    );
    expect(
      await $(`aria/${noteDeleteLabel(noteBody.slice(0, 30))}`).isExisting(),
    ).toBe(false);
    await closeDialog();
    await (await $(`aria/${deleteTaskLabel(taskTitle)}`)).click();
    await browser.waitUntil(
      async () => !(await $(`aria/${editTaskLabel(taskTitle)}`).isExisting()),
    );
    expect(await $(`aria/${editTaskLabel(taskTitle)}`).isExisting()).toBe(
      false,
    );
  });
});
