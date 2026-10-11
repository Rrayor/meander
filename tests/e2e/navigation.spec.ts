import { ROUTES } from "@/lib/routes";

import { expect, test } from "./fixtures";

test("main navigation exposes every page", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Main Navigation" });
  for (const { label } of ROUTES) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
});

for (const { label, path } of ROUTES) {
  const url = `/#${path}`;
  test(`navigates to ${label}`, async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Main Navigation" })
      .getByRole("link", { name: label })
      .click();

    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  });
}
