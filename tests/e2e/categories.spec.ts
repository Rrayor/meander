import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";
import {
  ADD_CATEGORY_LABEL,
  CATEGORY_TITLE_REQUIRED_MESSAGE,
  CATEGORIES_HEADING,
  CREATE_CATEGORY_LABEL,
  EMPTY_CATEGORIES_MESSAGE,
  NEW_CATEGORY_HEADING,
  TITLE_FIELD_LABEL,
  categoryCreatedLabel,
  categorySwatchLabel,
} from "@/lib/labels";
import { CATEGORY_COLORS } from "@/api/categories";
import { formatDate } from "@/lib/utils";

import { expect, test } from "./fixtures";
import {
  STUB_DB_PATH,
  getInvocations,
  stubSequence,
  stubTauriCommands,
} from "./stubs";

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

  const invocations = await getInvocations(page);
  expect(invocations).toContainEqual(
    expect.objectContaining({ cmd: COMMANDS.listCategories }),
  );
});

test("creating a category adds it to the list", async ({ page }) => {
  const created = { ...CATEGORY, id: 2 };
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.listCategories]: stubSequence([[], [created]]),
    [COMMANDS.createCategory]: created,
  });
  await page.goto(`/#${categoriesPath}`);

  await page.getByRole("button", { name: ADD_CATEGORY_LABEL }).click();
  await expect(
    page.getByRole("heading", { name: NEW_CATEGORY_HEADING }),
  ).toBeVisible();
  await page.getByLabel(new RegExp(TITLE_FIELD_LABEL)).fill(created.title);
  await page
    .getByRole("radio", { name: categorySwatchLabel(CATEGORY_COLORS[4]) })
    .click();
  await page.getByRole("button", { name: CREATE_CATEGORY_LABEL }).click();

  await expect(page.getByText(created.title)).toBeVisible();
  const invocations = await getInvocations(page);
  expect(invocations).toContainEqual({
    cmd: COMMANDS.createCategory,
    args: {
      input: {
        title: created.title,
        description: null,
        color: CATEGORY_COLORS[4],
      },
    },
  });
});

test("a blank category title shows validation without calling the backend", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.listCategories]: [],
  });
  await page.goto(`/#${categoriesPath}`);

  await page.getByRole("button", { name: ADD_CATEGORY_LABEL }).click();
  await page.getByRole("button", { name: CREATE_CATEGORY_LABEL }).click();

  await expect(page.getByRole("alert")).toHaveText(
    CATEGORY_TITLE_REQUIRED_MESSAGE,
  );
  const invocations = await getInvocations(page);
  expect(
    invocations.filter((i) => i.cmd === COMMANDS.createCategory),
  ).toHaveLength(0);
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
