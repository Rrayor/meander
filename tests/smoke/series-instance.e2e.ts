import {
  ADD_TASK_LABEL,
  CALENDAR_NEXT_LABEL,
  NAV_LABEL,
  CREATE_TASK_LABEL,
  DELETE_BUTTON_LABEL,
  EDIT_BUTTON_LABEL,
  REPEAT_SECTION_LABEL,
  SCHEDULED_INSTANCE_PENDING_MESSAGE,
  TASK_SCOPE_SERIES_LABEL,
  editTaskLabel,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

// Real end-to-end path: picking a scheduled-but-unpersisted date goes
// through get_or_create_instance IPC and SQLite, so the materialized
// instance must become editable in the same dialog session.
describe("Series instance smoke", () => {
  it("materializes a scheduled-only date into an editable instance", async () => {
    const taskTitle = `Smoke series ${Date.now()}`;

    const nav = await $(`aria/${NAV_LABEL}`);
    const backlogRoute = ROUTES.find(({ label }) => label === "Backlog")!;
    await nav.$(`=${backlogRoute.label}`).click();

    await (await $(`aria/${ADD_TASK_LABEL}`)).click();
    await (await $("#new-task-title-input")).setValue(taskTitle);
    // Expanding the repeat section emits a daily schedule by default, so
    // tomorrow is a scheduled-but-unpersisted occurrence.
    await (await $(`button*=${REPEAT_SECTION_LABEL}`)).click();
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

    // The materialized instance replaces the pending placeholder and is
    // editable because it is a future occurrence.
    const pendingPanel = await $(dialog).$(
      `*=${SCHEDULED_INSTANCE_PENDING_MESSAGE}`,
    );
    await browser.waitUntil(async () => !(await pendingPanel.isExisting()));
    await expect(await $(`${dialog} button*=${EDIT_BUTTON_LABEL}`)).toExist();
    await (await $(`${dialog} button*=${EDIT_BUTTON_LABEL}`)).click();
    await expect(await $(`${dialog} #edit-task-title-input`)).toExist();

    // Cleanup: delete the whole series through the real backend.
    const deleteButtons = await $$(`${dialog} button*=${DELETE_BUTTON_LABEL}`);
    await deleteButtons[0].click();
    await (await $(`aria/${TASK_SCOPE_SERIES_LABEL}`)).click();
    const confirmButtons = await $$(`${dialog} button*=${DELETE_BUTTON_LABEL}`);
    await confirmButtons[confirmButtons.length - 1].click();
    await browser.waitUntil(
      async () => !(await $(`aria/${editTaskLabel(taskTitle)}`).isExisting()),
    );
  });
});
