import { test, expect } from "./fixtures";

test("shows the demo screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meander" })).toBeVisible();
  await expect(page.getByRole("button", { name: "It works" })).toBeVisible();
});
