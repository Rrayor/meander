import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";

import { listCategories } from "@/api/categories";
import type { Category } from "@/api/categories";
import {
  CATEGORIES_HEADING,
  CATEGORIES_SUBTITLE,
  EMPTY_CATEGORIES_MESSAGE,
  categoryCreatedLabel,
} from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
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
