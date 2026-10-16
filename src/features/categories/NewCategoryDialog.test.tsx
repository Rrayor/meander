import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CATEGORY_COLORS, createCategory } from "@/api/categories";
import { NewCategoryDialog } from "@/features/categories/NewCategoryDialog";
import { CATEGORY_TITLE_TOO_LONG_MESSAGE } from "@/lib/errors";
import {
  CATEGORY_TITLE_REQUIRED_MESSAGE,
  CANCEL_BUTTON_LABEL,
  COLOR_FIELD_LABEL,
  CREATE_CATEGORY_LABEL,
  TITLE_FIELD_LABEL,
  categorySwatchLabel,
} from "@/lib/labels";
import { ApiError } from "@/api/transport";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  createCategory: vi.fn(),
}));

const CATEGORY_TITLE = "Errands";

const renderDialog = (onClose = vi.fn()) =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <NewCategoryDialog onClose={onClose} />
    </QueryClientProvider>,
  );

test("validates the title on blur before submit", async () => {
  renderDialog();
  const title = screen.getByLabelText(new RegExp(TITLE_FIELD_LABEL));
  fireEvent.blur(title);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      CATEGORY_TITLE_REQUIRED_MESSAGE,
    ),
  );
  expect(createCategory).not.toHaveBeenCalled();
});

test("submits title, description, and picked color on the wire", async () => {
  vi.mocked(createCategory).mockResolvedValue({} as never);
  const onClose = vi.fn();
  renderDialog(onClose);

  fireEvent.change(screen.getByLabelText(new RegExp(TITLE_FIELD_LABEL)), {
    target: { value: CATEGORY_TITLE },
  });
  fireEvent.change(screen.getByLabelText(/Description/), {
    target: { value: "  Things to buy  " },
  });
  const picked = CATEGORY_COLORS[3];
  fireEvent.click(
    screen.getByRole("radio", { name: categorySwatchLabel(picked) }),
  );
  fireEvent.click(screen.getByRole("button", { name: CREATE_CATEGORY_LABEL }));

  await waitFor(() =>
    expect(createCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        title: CATEGORY_TITLE,
        description: "Things to buy",
        color: picked,
      }),
      expect.anything(),
    ),
  );
});

test("no color pick sends null so the backend defaults to random", async () => {
  vi.mocked(createCategory).mockResolvedValue({} as never);
  renderDialog();

  fireEvent.change(screen.getByLabelText(new RegExp(TITLE_FIELD_LABEL)), {
    target: { value: CATEGORY_TITLE },
  });
  fireEvent.click(screen.getByRole("button", { name: CREATE_CATEGORY_LABEL }));

  await waitFor(() =>
    expect(createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ color: null }),
      expect.anything(),
    ),
  );
});

test("the color group is an accessible radiogroup", async () => {
  renderDialog();
  const group = screen.getByRole("radiogroup", {
    name: new RegExp(COLOR_FIELD_LABEL),
  });
  const radios = screen.getAllByRole("radio");
  expect(group).toContainElement(radios[0]);
  expect(radios.length).toBe(CATEGORY_COLORS.length + 1);
  fireEvent.click(
    screen.getByRole("radio", {
      name: categorySwatchLabel(CATEGORY_COLORS[0]),
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("radio", {
        name: categorySwatchLabel(CATEGORY_COLORS[0]),
      }),
    ).toHaveAttribute("aria-checked", "true"),
  );
});

test("Escape and Cancel close without submitting", async () => {
  const onClose = vi.fn();
  renderDialog(onClose);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalled();

  onClose.mockClear();
  fireEvent.click(screen.getByRole("button", { name: CANCEL_BUTTON_LABEL }));
  expect(onClose).toHaveBeenCalled();
  expect(createCategory).not.toHaveBeenCalled();
});

test("typed server errors map to the matching copy", async () => {
  vi.mocked(createCategory).mockRejectedValue(
    new ApiError("category_title_too_long", "validation", "server wording"),
  );
  renderDialog();

  fireEvent.change(screen.getByLabelText(new RegExp(TITLE_FIELD_LABEL)), {
    target: { value: CATEGORY_TITLE },
  });
  fireEvent.click(screen.getByRole("button", { name: CREATE_CATEGORY_LABEL }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      CATEGORY_TITLE_TOO_LONG_MESSAGE,
    ),
  );
});
