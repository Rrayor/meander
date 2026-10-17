import { COMMANDS } from "@/api/commands";
import { ROUTES } from "@/lib/routes";
import {
  ADD_CATEGORY_LABEL,
  CATEGORY_TITLE_REQUIRED_MESSAGE,
  CATEGORIES_HEADING,
  CREATE_CATEGORY_LABEL,
  CUSTOM_COLOR_LABEL,
  DESCRIPTION_FIELD_LABEL,
  EMPTY_CATEGORIES_MESSAGE,
  NEW_CATEGORY_HEADING,
  TITLE_FIELD_LABEL,
  categoryCreatedLabel,
  categorySwatchLabel,
} from "@/lib/labels";
import { CATEGORY_COLORS } from "@/api/categories";
import { CATEGORY_COLOR_INVALID_MESSAGE } from "@/lib/errors";
import { formatDate } from "@/lib/utils";

import { expect, test } from "./fixtures";
import {
  STUB_DB_PATH,
  getInvocations,
  stubApiError,
  stubError,
  stubSequence,
  stubTauriCommands,
} from "./stubs";

const categoriesPath = ROUTES.find((r) => r.label === "Categories")!.path;

// CSS serializes hex colors to rgb() — convert stored hexes for toHaveCSS.
const hexToRgbCss = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

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

  // Category colors are stored data, applied inline — assert the hex the
  // backend returned is what the row's dot renders.
  await expect(page.locator("li span[aria-hidden='true']").first()).toHaveCSS(
    "background-color",
    hexToRgbCss(CATEGORY.color),
  );

  const invocations = await getInvocations(page);
  expect(invocations).toContainEqual(
    expect.objectContaining({ cmd: COMMANDS.listCategories }),
  );
});

test("a failed category list shows an error alert", async ({ page }) => {
  const LIST_ERROR = "sqlite is unhappy";
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.listCategories]: stubError(LIST_ERROR),
  });
  await page.goto(`/#${categoriesPath}`);

  await expect(page.getByRole("alert")).toHaveText(LIST_ERROR);
  await expect(page.getByText(EMPTY_CATEGORIES_MESSAGE)).not.toBeVisible();
});

test("a typed list error surfaces through the transport", async ({ page }) => {
  const LIST_ERROR_MESSAGE = "profile has no categories table";
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.listCategories]: stubApiError(
      "database",
      "backend",
      LIST_ERROR_MESSAGE,
    ),
  });
  await page.goto(`/#${categoriesPath}`);

  await expect(page.getByRole("alert")).toHaveText(LIST_ERROR_MESSAGE);
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

test("the dialog sends description and a custom picked color on the wire", async ({
  page,
}) => {
  const created = {
    ...CATEGORY,
    id: 2,
    description: "Errands and shopping",
    color: "#123abc",
  };
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.listCategories]: stubSequence([[], [created]]),
    [COMMANDS.createCategory]: created,
  });
  await page.goto(`/#${categoriesPath}`);

  await page.getByRole("button", { name: ADD_CATEGORY_LABEL }).click();
  await page.getByLabel(new RegExp(TITLE_FIELD_LABEL)).fill(created.title);
  await page
    .getByLabel(new RegExp(DESCRIPTION_FIELD_LABEL))
    .fill(created.description);
  await page.getByLabel(CUSTOM_COLOR_LABEL).fill(created.color);
  await page.getByRole("button", { name: CREATE_CATEGORY_LABEL }).click();

  const invocations = await getInvocations(page);
  expect(invocations).toContainEqual({
    cmd: COMMANDS.createCategory,
    args: {
      input: {
        title: created.title,
        description: created.description,
        color: created.color,
      },
    },
  });
});

test("no color pick sends a null color for the backend default", async ({
  page,
}) => {
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
  await page.getByLabel(new RegExp(TITLE_FIELD_LABEL)).fill(created.title);
  await page.getByRole("button", { name: CREATE_CATEGORY_LABEL }).click();

  const invocations = await getInvocations(page);
  expect(invocations).toContainEqual({
    cmd: COMMANDS.createCategory,
    args: {
      input: { title: created.title, description: null, color: null },
    },
  });
});

test("a typed server rejection keeps the dialog open with the mapped message", async ({
  page,
}) => {
  await stubTauriCommands(page, {
    [COMMANDS.currentProfile]: current,
    [COMMANDS.listProfiles]: [current],
    [COMMANDS.currentDbPath]: STUB_DB_PATH,
    [COMMANDS.listCategories]: [],
    [COMMANDS.createCategory]: stubApiError(
      "category_color_invalid",
      "validation",
      "category color must be a #rrggbb hex value",
    ),
  });
  await page.goto(`/#${categoriesPath}`);

  await page.getByRole("button", { name: ADD_CATEGORY_LABEL }).click();
  await page.getByLabel(new RegExp(TITLE_FIELD_LABEL)).fill(CATEGORY.title);
  await page.getByRole("button", { name: CREATE_CATEGORY_LABEL }).click();

  await expect(page.getByRole("alert")).toHaveText(
    CATEGORY_COLOR_INVALID_MESSAGE,
  );
  await expect(
    page.getByRole("heading", { name: NEW_CATEGORY_HEADING }),
  ).toBeVisible();
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
