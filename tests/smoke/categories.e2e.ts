import {
  ADD_CATEGORY_LABEL,
  CATEGORIES_HEADING,
  CLOSE_LABEL,
  CUSTOM_COLOR_LABEL,
  NAV_LABEL,
  deleteCategoryLabel,
  editCategoryLabel,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

// Real end-to-end path: drives the release build's webview so the
// create_category IPC and SQLite persistence are exercised, not stubbed.
describe("Categories smoke", () => {
  it("creates a category through the real backend", async () => {
    const categoriesRoute = ROUTES.find(
      ({ label }) => label === CATEGORIES_HEADING,
    )!;
    const nav = await $(`aria/${NAV_LABEL}`);
    await nav.$(`=${categoriesRoute.label}`).click();

    const titleInput = "#category-title-input";
    const submit = "button[type='submit']";

    await (await $(`aria/${ADD_CATEGORY_LABEL}`)).click();
    await expect(await $(titleInput)).toExist();

    const title = `Smoke ${Date.now()}`;
    await (await $(titleInput)).setValue(title);
    await (await $(submit)).click();

    // WebKitWebDriver's getText omits button contents — the row title now
    // lives in the edit affordance, so assert its aria-label instead.
    await browser.waitUntil(async () =>
      (await $(`aria/${editCategoryLabel(title)}`)).isExisting(),
    );

    // Edit through the real backend: rename via the dialog and confirm the
    // list refetches the updated row.
    const renamed = `${title} renamed`;
    await (await $(`aria/${editCategoryLabel(title)}`)).click();
    const editInput = await $(titleInput);
    await editInput.setValue(renamed);
    await (await $(submit)).click();
    await browser.waitUntil(async () =>
      (await $(`aria/${editCategoryLabel(renamed)}`)).isExisting(),
    );

    // Delete through the real backend too.
    const deleteBtn = await $(`aria/${deleteCategoryLabel(renamed)}`);
    await deleteBtn.click();
    await browser.waitUntil(
      async () => !(await $(`aria/${editCategoryLabel(renamed)}`).isExisting()),
    );
  });

  it("shows the color radiogroup with a selected default", async () => {
    const categoriesRoute = ROUTES.find(
      ({ label }) => label === CATEGORIES_HEADING,
    )!;
    const nav = await $(`aria/${NAV_LABEL}`);
    await nav.$(`=${categoriesRoute.label}`).click();
    await (await $(`aria/${ADD_CATEGORY_LABEL}`)).click();

    const group = await $("[role='radiogroup']");
    await expect(group).toExist();
    const checked = await $$("[role='radio'][aria-checked='true']");
    expect(checked).toHaveLength(1);

    // Custom color is a real radio option now — verify it exists.
    await expect(await $(`aria/${CUSTOM_COLOR_LABEL}`)).toExist();
    await (await $(`aria/${CLOSE_LABEL}`)).click();
  });
});
