import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { createCategory, listCategories } from "@/api/categories";
import type { Category } from "@/api/categories";
import {
  ADD_CATEGORY_LABEL,
  CATEGORIES_HEADING,
  NEW_CATEGORY_HEADING,
  CATEGORIES_SUBTITLE,
  CREATE_CATEGORY_LABEL,
  EMPTY_CATEGORIES_MESSAGE,
  TITLE_FIELD_LABEL,
  categoryCreatedLabel,
} from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
}));

const CATEGORY: Category = {
  id: 1,
  profile_id: 1,
  title: "Errands",
  description: null,
  color: "#2DD4BF",
  created_at: "2026-10-10 09:00:00",
  updated_at: "2026-10-10 09:00:00",
};

const SECOND_CATEGORY: Category = {
  ...CATEGORY,
  id: 2,
  title: "Admin",
  color: null,
  created_at: "2026-10-12 09:00:00",
};

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

test("the color dot applies the stored color and a neutral fallback", async () => {
  vi.mocked(listCategories).mockResolvedValue([CATEGORY, SECOND_CATEGORY]);
  renderPage();

  await waitFor(() =>
    expect(screen.getByText(CATEGORY.title)).toBeInTheDocument(),
  );
  const [colored, uncolored] = document.querySelectorAll(
    "span[aria-hidden='true']",
  );
  expect(colored).toHaveStyle({ backgroundColor: CATEGORY.color! });
  expect(uncolored).toHaveStyle({ backgroundColor: "var(--color-text-muted)" });
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
