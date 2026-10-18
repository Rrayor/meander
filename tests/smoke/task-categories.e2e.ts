import {
  ADD_CATEGORY_LABEL,
  ADD_TASK_LABEL,
  CATEGORIES_HEADING,
  CATEGORY_SEARCH_LABEL,
  CREATE_TASK_LABEL,
  NAV_LABEL,
  deleteCategoryLabel,
  deleteTaskLabel,
  CLOSE_LABEL,
  editTaskLabel,
  removeTaskCategoryLabel,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

// Real end-to-end path: assigning a category inside the task dialog goes
// through add_task_category IPC and SQLite, so the association must survive
// a reopen of the task's edit dialog.
describe("Task categories smoke", () => {
  it("associates a category with a task through the real backend", async () => {
    const nav = await $(`aria/${NAV_LABEL}`);

    const categoriesRoute = ROUTES.find(
      ({ label }) => label === CATEGORIES_HEADING,
    )!;
    await nav.$(`=${categoriesRoute.label}`).click();
    await (await $(`aria/${ADD_CATEGORY_LABEL}`)).click();
    const categoryTitle = `Smoke cat ${Date.now()}`;
    await (await $("#category-title-input")).setValue(categoryTitle);
    await (await $("button[type='submit']")).click();
    const list = await $("ul");
    await browser.waitUntil(async () =>
      (await list.getText()).includes(categoryTitle),
    );

    const backlogRoute = ROUTES.find(({ label }) => label === "Backlog")!;
    await nav.$(`=${backlogRoute.label}`).click();
    await (await $(`aria/${ADD_TASK_LABEL}`)).click();

    const picker = await $(`aria/${CATEGORY_SEARCH_LABEL}`);
    await picker.click();
    const option = await $(`[role='option']*=${categoryTitle}`);
    await option.click();

    await expect(
      await $(`aria/${removeTaskCategoryLabel(categoryTitle)}`),
    ).toExist();

    const taskTitle = `Smoke task ${Date.now()}`;
    await (await $("#new-task-title-input")).setValue(taskTitle);
    await (await $(`aria/${CREATE_TASK_LABEL}`)).click();
    await browser.waitUntil(async () =>
      (await $(`aria/${editTaskLabel(taskTitle)}`)).isExisting(),
    );

    // Reopen the task: the persisted association must render as a chip.
    await (await $(`aria/${editTaskLabel(taskTitle)}`)).click();
    await expect(
      await $(`aria/${removeTaskCategoryLabel(categoryTitle)}`),
    ).toExist();
    await (await $(`aria/${CLOSE_LABEL}`)).click();

    // Cleanup: deleting the task and the category through the real backend.
    await (await $(`aria/${deleteTaskLabel(taskTitle)}`)).click();
    await browser.waitUntil(
      async () => !(await $("body").getText()).includes(taskTitle),
    );
    await nav.$(`=${categoriesRoute.label}`).click();
    await (await $(`aria/${deleteCategoryLabel(categoryTitle)}`)).click();
    await browser.waitUntil(
      async () => !(await $("body").getText()).includes(categoryTitle),
    );
  });
});
