import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  DEFAULT_CATEGORY_COLOR,
  createCategory,
  deleteCategory,
  listCategories,
} from "@/api/categories";
import type { Category } from "@/api/categories";
import { currentProfile, listProfiles, switchProfile } from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import {
  ADD_CATEGORY_LABEL,
  CATEGORIES_HEADING,
  NEW_CATEGORY_HEADING,
  CATEGORIES_SUBTITLE,
  CREATE_CATEGORY_LABEL,
  EMPTY_CATEGORIES_MESSAGE,
  TITLE_FIELD_LABEL,
  categoryCreatedLabel,
  deleteCategoryLabel,
  editCategoryLabel,
  EDIT_CATEGORY_HEADING,
} from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { ProfileSwitcher } from "@/components/layout/ProfileSwitcher";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  currentProfile: vi.fn(),
  listProfiles: vi.fn(),
  switchProfile: vi.fn(),
}));

const CATEGORY: Category = {
  id: 1,
  profile_id: 1,
  title: "Errands",
  description: null,
  color: "#2DD4BF",
  threshold_minutes: null,
  threshold_color: null,
  threshold_day_minutes: {},
  created_at: "2026-10-10 09:00:00",
  updated_at: "2026-10-10 09:00:00",
};

const SECOND_CATEGORY: Category = {
  ...CATEGORY,
  id: 2,
  title: "Admin",
  color: null,
  threshold_minutes: null,
  threshold_color: null,
  threshold_day_minutes: {},
  created_at: "2026-10-12 09:00:00",
};

const PROFILE: Profile = {
  id: 1,
  name: "Default",
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-01 08:00:00",
};

const OTHER_PROFILE: Profile = { ...PROFILE, id: 2, name: "Work" };

const OTHER_CATEGORY: Category = {
  ...SECOND_CATEGORY,
  id: 3,
  profile_id: OTHER_PROFILE.id,
  title: "Meetings",
};

beforeEach(() => {
  vi.mocked(currentProfile).mockResolvedValue(PROFILE);
});

const renderPage = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <CategoriesPage />
    </QueryClientProvider>,
  );

test("lists categories with title, color dot, and audit date", async () => {
  vi.mocked(listCategories).mockResolvedValue([CATEGORY, SECOND_CATEGORY]);
  renderPage();

  await waitFor(() =>
    expect(screen.getByText(CATEGORY.title)).toBeInTheDocument(),
  );
  expect(screen.getByText(SECOND_CATEGORY.title)).toBeInTheDocument();
  expect(
    screen.getByText(categoryCreatedLabel(formatDate(CATEGORY.created_at))),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: CATEGORIES_HEADING }),
  ).toBeInTheDocument();
  expect(screen.getByText(CATEGORIES_SUBTITLE)).toBeInTheDocument();
});

test("the color dot applies the stored color and the accent fallback", async () => {
  vi.mocked(listCategories).mockResolvedValue([CATEGORY, SECOND_CATEGORY]);
  renderPage();

  await waitFor(() =>
    expect(screen.getByText(CATEGORY.title)).toBeInTheDocument(),
  );
  const [colored, uncolored] = document.querySelectorAll(
    "span[aria-hidden='true']",
  );
  expect(colored).toHaveStyle({ backgroundColor: CATEGORY.color! });
  expect(uncolored).toHaveStyle({ backgroundColor: DEFAULT_CATEGORY_COLOR });
});

test("rows render in the order the backend returns", async () => {
  vi.mocked(listCategories).mockResolvedValue([CATEGORY, SECOND_CATEGORY]);
  renderPage();

  await waitFor(() =>
    expect(screen.getByText(SECOND_CATEGORY.title)).toBeInTheDocument(),
  );
  const titles = [...document.querySelectorAll("li")].map(
    (li) => li.textContent,
  );
  const first = titles.findIndex((t) => t?.includes(CATEGORY.title));
  const second = titles.findIndex((t) => t?.includes(SECOND_CATEGORY.title));
  expect(first).toBeGreaterThanOrEqual(0);
  expect(first).toBeLessThan(second);
});

test("the add category button opens the creation dialog", async () => {
  vi.mocked(listCategories).mockResolvedValue([]);
  renderPage();

  await waitFor(() =>
    expect(screen.getByText(EMPTY_CATEGORIES_MESSAGE)).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: ADD_CATEGORY_LABEL }));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: NEW_CATEGORY_HEADING }),
    ).toBeInTheDocument(),
  );
});

test("a successful create refreshes the list", async () => {
  vi.mocked(listCategories)
    .mockResolvedValueOnce([])
    .mockResolvedValue([CATEGORY]);
  vi.mocked(createCategory).mockResolvedValue(CATEGORY);
  renderPage();

  fireEvent.click(
    await screen.findByRole("button", { name: ADD_CATEGORY_LABEL }),
  );
  fireEvent.change(screen.getByLabelText(new RegExp(TITLE_FIELD_LABEL)), {
    target: { value: CATEGORY.title },
  });
  fireEvent.click(screen.getByRole("button", { name: CREATE_CATEGORY_LABEL }));

  await waitFor(() =>
    expect(screen.getByText(CATEGORY.title)).toBeInTheDocument(),
  );
  expect(listCategories).toHaveBeenCalledTimes(2);
});

test("the edit button opens the dialog pre-filled with the row's category", async () => {
  vi.mocked(listCategories).mockResolvedValue([CATEGORY]);
  renderPage();

  fireEvent.click(
    await screen.findByRole("button", {
      name: editCategoryLabel(CATEGORY.title),
    }),
  );

  expect(
    screen.getByRole("heading", { name: EDIT_CATEGORY_HEADING }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(new RegExp(TITLE_FIELD_LABEL))).toHaveValue(
    CATEGORY.title,
  );
});

test("deleting a category calls the backend and refreshes the list", async () => {
  vi.mocked(listCategories)
    .mockResolvedValueOnce([CATEGORY, SECOND_CATEGORY])
    .mockResolvedValue([SECOND_CATEGORY]);
  vi.mocked(deleteCategory).mockResolvedValue(undefined);
  renderPage();

  fireEvent.click(
    await screen.findByRole("button", {
      name: deleteCategoryLabel(CATEGORY.title),
    }),
  );

  await waitFor(() =>
    expect(deleteCategory).toHaveBeenCalledWith(CATEGORY.id, expect.anything()),
  );
  await waitFor(() =>
    expect(screen.queryByText(CATEGORY.title)).not.toBeInTheDocument(),
  );
  expect(screen.getByText(SECOND_CATEGORY.title)).toBeInTheDocument();
  expect(listCategories).toHaveBeenCalledTimes(2);
});

test("a failed delete leaves the list untouched and surfaces an alert", async () => {
  const DELETE_ERROR = "fk locked";
  vi.mocked(listCategories).mockResolvedValue([CATEGORY]);
  vi.mocked(deleteCategory).mockRejectedValue(new Error(DELETE_ERROR));
  renderPage();

  fireEvent.click(
    await screen.findByRole("button", {
      name: deleteCategoryLabel(CATEGORY.title),
    }),
  );

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(DELETE_ERROR),
  );
  expect(screen.getByText(CATEGORY.title)).toBeInTheDocument();
});

test("a delete failure from the old profile does not follow the switch", async () => {
  const DELETE_ERROR = "delete blew up";
  vi.mocked(listCategories)
    .mockResolvedValueOnce([CATEGORY])
    .mockResolvedValue([OTHER_CATEGORY]);
  vi.mocked(deleteCategory).mockRejectedValue(new Error(DELETE_ERROR));
  vi.mocked(listProfiles).mockResolvedValue([PROFILE, OTHER_PROFILE]);
  vi.mocked(currentProfile)
    .mockResolvedValueOnce(PROFILE)
    .mockResolvedValue(OTHER_PROFILE);
  vi.mocked(switchProfile).mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={testQueryClient()}>
      <CategoriesPage />
      <ProfileSwitcher />
    </QueryClientProvider>,
  );

  fireEvent.click(
    await screen.findByRole("button", {
      name: deleteCategoryLabel(CATEGORY.title),
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(DELETE_ERROR),
  );

  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(PROFILE.name) }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: OTHER_PROFILE.name }),
  );

  await waitFor(() =>
    expect(screen.getByText(OTHER_CATEGORY.title)).toBeInTheDocument(),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("an open editor does not survive a profile switch", async () => {
  vi.mocked(listCategories)
    .mockResolvedValueOnce([CATEGORY])
    .mockResolvedValue([OTHER_CATEGORY]);
  vi.mocked(listProfiles).mockResolvedValue([PROFILE, OTHER_PROFILE]);
  vi.mocked(currentProfile)
    .mockResolvedValueOnce(PROFILE)
    .mockResolvedValue(OTHER_PROFILE);
  vi.mocked(switchProfile).mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={testQueryClient()}>
      <CategoriesPage />
      <ProfileSwitcher />
    </QueryClientProvider>,
  );

  fireEvent.click(
    await screen.findByRole("button", {
      name: editCategoryLabel(CATEGORY.title),
    }),
  );
  expect(
    screen.getByRole("heading", { name: EDIT_CATEGORY_HEADING }),
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(PROFILE.name) }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: OTHER_PROFILE.name }),
  );

  await waitFor(() =>
    expect(screen.getByText(OTHER_CATEGORY.title)).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("heading", { name: EDIT_CATEGORY_HEADING }),
  ).not.toBeInTheDocument();
});

test("an editor opened from the new list survives the delayed profile load", async () => {
  // Post-switch race: the category query can resolve before
  // currentProfile. An editor opened for a new-profile row belongs to
  // that profile — the switch handler must not close it when the
  // delayed response lands.
  let resolveProfile: (p: Profile) => void = () => {};
  vi.mocked(currentProfile)
    .mockReset()
    .mockResolvedValueOnce(PROFILE)
    .mockImplementation(
      () => new Promise<Profile>((r) => (resolveProfile = r)),
    );
  vi.mocked(listCategories)
    .mockResolvedValueOnce([CATEGORY])
    .mockResolvedValue([OTHER_CATEGORY]);
  vi.mocked(listProfiles).mockResolvedValue([PROFILE, OTHER_PROFILE]);
  vi.mocked(switchProfile).mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={testQueryClient()}>
      <CategoriesPage />
      <ProfileSwitcher />
    </QueryClientProvider>,
  );
  await screen.findByText(CATEGORY.title);

  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(PROFILE.name) }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: OTHER_PROFILE.name }),
  );

  // The new list renders while currentProfile is still pending.
  fireEvent.click(
    await screen.findByRole("button", {
      name: editCategoryLabel(OTHER_CATEGORY.title),
    }),
  );
  expect(
    screen.getByRole("heading", { name: EDIT_CATEGORY_HEADING }),
  ).toBeInTheDocument();

  resolveProfile(OTHER_PROFILE);

  // Give the effect a beat to run, then confirm the editor stayed open.
  await new Promise((r) => setTimeout(r));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: EDIT_CATEGORY_HEADING }),
    ).toBeInTheDocument(),
  );
});

test("switching profiles refetches the category list", async () => {
  vi.mocked(listCategories)
    .mockResolvedValueOnce([CATEGORY])
    .mockResolvedValue([OTHER_CATEGORY]);
  vi.mocked(listProfiles).mockResolvedValue([PROFILE, OTHER_PROFILE]);
  vi.mocked(currentProfile)
    .mockResolvedValueOnce(PROFILE)
    .mockResolvedValue(OTHER_PROFILE);
  vi.mocked(switchProfile).mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={testQueryClient()}>
      <CategoriesPage />
      <ProfileSwitcher />
    </QueryClientProvider>,
  );

  await waitFor(() =>
    expect(screen.getByText(CATEGORY.title)).toBeInTheDocument(),
  );

  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(PROFILE.name) }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: OTHER_PROFILE.name }),
  );

  await waitFor(() =>
    expect(screen.getByText(OTHER_CATEGORY.title)).toBeInTheDocument(),
  );
  expect(screen.queryByText(CATEGORY.title)).not.toBeInTheDocument();
  expect(switchProfile).toHaveBeenCalledWith(
    OTHER_PROFILE.id,
    expect.anything(),
  );
});

test("shows the empty state when there are no categories", async () => {
  vi.mocked(listCategories).mockResolvedValue([]);
  renderPage();

  await waitFor(() =>
    expect(screen.getByText(EMPTY_CATEGORIES_MESSAGE)).toBeInTheDocument(),
  );
});

test("surfaces backend errors in an alert region", async () => {
  const SERVER_MESSAGE = "database exploded";
  vi.mocked(listCategories).mockRejectedValue(new Error(SERVER_MESSAGE));
  renderPage();

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(SERVER_MESSAGE),
  );
});
