import { expect, test } from "./fixtures";

const pages = [
  { label: "Board", url: "/#/" },
  { label: "Backlog", url: "/#/backlog" },
  { label: "Settings", url: "/#/settings" },
] as const;

test("main navigation exposes every page", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Main Navigation" });
  for (const { label } of pages) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
});

for (const { label, url } of pages) {
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
