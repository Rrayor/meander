import {
  ADD_CATEGORY_LABEL,
  ADD_TASK_LABEL,
  CATEGORIES_HEADING,
  CATEGORY_SEARCH_LABEL,
  CREATE_TASK_LABEL,
  NAV_LABEL,
  SAVE_BUTTON_LABEL,
  deleteCategoryLabel,
  deleteTaskLabel,
  editCategoryLabel,
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
    // WebKitWebDriver's getText omits button contents — assert the row's
    // edit affordance (an aria-label) rather than matching list text.
    await browser.waitUntil(async () =>
      (await $(`aria/${editCategoryLabel(categoryTitle)}`)).isExisting(),
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
      async () => !(await $(`aria/${editTaskLabel(taskTitle)}`).isExisting()),
    );
    await nav.$(`=${categoriesRoute.label}`).click();
    await (await $(`aria/${deleteCategoryLabel(categoryTitle)}`)).click();
    await browser.waitUntil(
      async () =>
        !(await $(`aria/${editCategoryLabel(categoryTitle)}`).isExisting()),
    );
  });

  it("persists a category quick-created inside the edit dialog", async () => {
    const nav = await $(`aria/${NAV_LABEL}`);
    const backlogRoute = ROUTES.find(({ label }) => label === "Backlog")!;
    await nav.$(`=${backlogRoute.label}`).click();
    await (await $(`aria/${ADD_TASK_LABEL}`)).click();
    const taskTitle = `Smoke edit task ${Date.now()}`;
    await (await $("#new-task-title-input")).setValue(taskTitle);
    await (await $(`aria/${CREATE_TASK_LABEL}`)).click();
    await browser.waitUntil(async () =>
      (await $(`aria/${editTaskLabel(taskTitle)}`)).isExisting(),
    );

    // Open the task's editor and quick-create a category from the picker.
    await (await $(`aria/${editTaskLabel(taskTitle)}`)).click();
    const picker = await $(`aria/${CATEGORY_SEARCH_LABEL}`);
    await picker.click();
    const createdTitle = `Smoke qc ${Date.now()}`;
    await picker.setValue(createdTitle);
    // The create row renders `Create "<title>"` — its embedded quotes break
    // a *= selector, so match the typed title text instead.
    const createOption = await $(`[role='option']*=${createdTitle}`);
    await browser.waitUntil(() => createOption.isExisting());
    await createOption.click();
    await expect(
      await $(`aria/${removeTaskCategoryLabel(createdTitle)}`),
    ).toExist();

    await (await $(`aria/${SAVE_BUTTON_LABEL}`)).click();
    await browser.waitUntil(
      async () => !(await $(`aria/${SAVE_BUTTON_LABEL}`).isExisting()),
    );

    // Reopen: the association must have been written through add_task_category.
    await (await $(`aria/${editTaskLabel(taskTitle)}`)).click();
    await expect(
      await $(`aria/${removeTaskCategoryLabel(createdTitle)}`),
    ).toExist();
    await (await $(`aria/${CLOSE_LABEL}`)).click();

    // Cleanup: delete the task, then the quick-created category.
    await (await $(`aria/${deleteTaskLabel(taskTitle)}`)).click();
    await browser.waitUntil(
      async () => !(await $(`aria/${editTaskLabel(taskTitle)}`).isExisting()),
    );
    const categoriesRoute = ROUTES.find(
      ({ label }) => label === CATEGORIES_HEADING,
    )!;
    await nav.$(`=${categoriesRoute.label}`).click();
    await (await $(`aria/${deleteCategoryLabel(createdTitle)}`)).click();
    await browser.waitUntil(
      async () =>
        !(await $(`aria/${editCategoryLabel(createdTitle)}`).isExisting()),
    );
  });
});
