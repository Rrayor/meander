import { expect, test } from "./fixtures";

test("main navigation switches between pages", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Main Navigation" });
  await expect(nav.getByRole("link", { name: "Board" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Backlog" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();

  await nav.getByRole("link", { name: "Backlog" }).click();
  await expect(page).toHaveURL(/\/backlog$/);
  await expect(page.getByRole("heading", { name: "Backlog" })).toBeVisible();

  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await nav.getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
});
