import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";
import {
  CATEGORIES_HEADING,
  EMPTY_CATEGORIES_MESSAGE,
  categoryCreatedLabel,
} from "@/lib/labels";
import { formatDate } from "@/lib/utils";

import { expect, test } from "./fixtures";
import { STUB_DB_PATH, stubTauriCommands } from "./stubs";

const categoriesPath = ROUTES.find((r) => r.label === "Categories")!.path;

const current = {
  id: 1,
  name: "Default",
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-10 09:14:00",
};

const CATEGORY = {
  id: 1,
  profile_id: 1,
  title: "Errands",
  description: null,
  color: "#2DD4BF",
  created_at: "2026-10-10 09:00:00",
  updated_at: "2026-10-10 09:00:00",
};

test("the categories page lists categories with audit metadata", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.listCategories]: [CATEGORY],
  });
  await page.goto(`/#${categoriesPath}`);

  await expect(
    page.getByRole("heading", { name: CATEGORIES_HEADING }),
  ).toBeVisible();
  await expect(page.getByText(CATEGORY.title)).toBeVisible();
  await expect(
    page.getByText(categoryCreatedLabel(formatDate(CATEGORY.created_at))),
  ).toBeVisible();
});

test("an empty category list shows the empty state", async ({ page }) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.listCategories]: [],
  });
  await page.goto(`/#${categoriesPath}`);

  await expect(page.getByText(EMPTY_CATEGORIES_MESSAGE)).toBeVisible();
});
