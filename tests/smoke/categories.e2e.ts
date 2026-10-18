import {
  ADD_CATEGORY_LABEL,
  CATEGORIES_HEADING,
  CLOSE_LABEL,
  CUSTOM_COLOR_LABEL,
  NAV_LABEL,
  deleteCategoryLabel,
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

    const titleInput = "#new-category-title-input";
    const submit = "button[type='submit']";

    await (await $(`aria/${ADD_CATEGORY_LABEL}`)).click();
    await expect(await $(titleInput)).toExist();

    const title = `Smoke ${Date.now()}`;
    await (await $(titleInput)).setValue(title);
    await (await $(submit)).click();

    const list = await $("ul");
    await browser.waitUntil(async () => (await list.getText()).includes(title));

    // Delete through the real backend too — the row is hover-revealed, so
    // move to it before clicking its labeled button.
    const row = await $("li");
    await row.moveTo();
    const deleteBtn = await $(`aria/${deleteCategoryLabel(title)}`);
    await deleteBtn.click();
    await browser.waitUntil(
      async () => !(await list.getText()).includes(title),
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
