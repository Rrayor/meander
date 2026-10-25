import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { createCategory, listCategories } from "@/api/categories";
import type { Category } from "@/api/categories";
import { CategoryMultiSelect } from "@/features/categories/CategoryMultiSelect";
import {
  createCategoryOptionLabel,
  removeTaskCategoryLabel,
} from "@/lib/labels";
import { categoryFixture } from "@/test/fixtures";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
}));

const mockedList = vi.mocked(listCategories);
const mockedCreate = vi.mocked(createCategory);

const ERRANDS = categoryFixture();
const WORK = categoryFixture({ id: 2, title: "Work", color: "#fb923c" });
const HOBBIES = categoryFixture({ id: 3, title: "Hobbies", color: "#a78bfa" });
const MIDNIGHT = categoryFixture({
  id: 4,
  title: "Midnight",
  color: "#000000",
});
const MIDNIGHT_RGB = "0, 0, 0";

const NEW_TITLE = "Gardening";
const BACKSPACE = "Backspace";

const Harness = () => {
  const [selected, setSelected] = useState<Category[]>([]);
  return (
    <CategoryMultiSelect
      idPrefix="test"
      selected={selected}
      onChange={setSelected}
    />
  );
};

const renderSelect = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <Harness />
    </QueryClientProvider>,
  );

const input = () => screen.getByRole("combobox");

describe("CategoryMultiSelect", () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([ERRANDS, WORK, HOBBIES]);
    mockedCreate.mockReset();
  });

  it("lists every category on focus when the input is empty", async () => {
    renderSelect();
    fireEvent.focus(input());
    for (const c of [ERRANDS, WORK, HOBBIES]) {
      expect(
        await screen.findByRole("option", { name: new RegExp(c.title) }),
      ).toBeInTheDocument();
    }
  });

  it("filters the options by the typed text", async () => {
    renderSelect();
    fireEvent.focus(input());
    await screen.findByRole("option", { name: /Errands/ });
    fireEvent.change(input(), { target: { value: "hobb" } });
    expect(screen.getByRole("option", { name: /Hobbies/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Errands/ }),
    ).not.toBeInTheDocument();
  });

  it("toggles a selection into a removable chip", async () => {
    renderSelect();
    fireEvent.focus(input());
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Errands/ }));
    expect(
      screen.getByRole("button", {
        name: removeTaskCategoryLabel(ERRANDS.title),
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: removeTaskCategoryLabel(ERRANDS.title),
      }),
    );
    expect(
      screen.queryByRole("button", {
        name: removeTaskCategoryLabel(ERRANDS.title),
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps a dark custom color off the chip text", () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <CategoryMultiSelect
          idPrefix="test"
          selected={[MIDNIGHT]}
          onChange={() => {}}
        />
      </QueryClientProvider>,
    );
    const chip = screen.getByText(MIDNIGHT.title);
    // The hue survives on the surface tint and the dot; the name and the
    // remove button inherit the text foreground so a dark color cannot
    // sink the label.
    expect(chip).toHaveClass("text-text");
    expect(chip.style.color).toBe("");
    expect(chip.querySelector("span")).toHaveStyle({
      backgroundColor: `rgb(${MIDNIGHT_RGB})`,
    });
  });

  it("marks selected options aria-selected and toggles them off", async () => {
    renderSelect();
    fireEvent.focus(input());
    const option = await screen.findByRole("option", { name: /Work/ });
    fireEvent.mouseDown(option);
    expect(screen.getByRole("option", { name: /Work/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.mouseDown(screen.getByRole("option", { name: /Work/ }));
    expect(screen.getByRole("option", { name: /Work/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("offers a create option for an unknown title and selects the result", async () => {
    const created: Category = { ...ERRANDS, id: 9, title: NEW_TITLE };
    mockedCreate.mockResolvedValue(created);
    renderSelect();
    fireEvent.focus(input());
    await screen.findByRole("option", { name: /Errands/ });
    fireEvent.change(input(), { target: { value: NEW_TITLE } });
    fireEvent.mouseDown(
      screen.getByRole("option", {
        name: new RegExp(createCategoryOptionLabel(NEW_TITLE)),
      }),
    );
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        { title: NEW_TITLE, description: null, color: null },
        expect.anything(),
      ),
    );
    expect(
      await screen.findByRole("button", {
        name: removeTaskCategoryLabel(NEW_TITLE),
      }),
    ).toBeInTheDocument();
  });

  it("does not offer to create a title that already exists", async () => {
    renderSelect();
    fireEvent.focus(input());
    await screen.findByRole("option", { name: /Errands/ });
    fireEvent.change(input(), { target: { value: "errands" } });
    expect(
      screen.queryByRole("option", { name: /Create/ }),
    ).not.toBeInTheDocument();
  });

  it("selects the active option from the keyboard", async () => {
    renderSelect();
    fireEvent.focus(input());
    await screen.findByRole("option", { name: /Errands/ });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(
      screen.getByRole("button", {
        name: removeTaskCategoryLabel(ERRANDS.title),
      }),
    ).toBeInTheDocument();
  });

  it("Backspace on an empty input removes the last chip only", async () => {
    renderSelect();
    fireEvent.focus(input());
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Errands/ }));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Work/ }));
    // Backspace pops the most recent chip; typing guards against pops.
    fireEvent.keyDown(input(), { key: BACKSPACE });
    expect(
      screen.queryByRole("button", {
        name: removeTaskCategoryLabel(WORK.title),
      }),
    ).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: "e" } });
    fireEvent.keyDown(input(), { key: BACKSPACE });
    expect(
      screen.getByRole("button", {
        name: removeTaskCategoryLabel(ERRANDS.title),
      }),
    ).toBeInTheDocument();
  });

  it("surfaces a failed quick-create inline", async () => {
    mockedCreate.mockRejectedValue(new Error("offline"));
    renderSelect();
    fireEvent.focus(input());
    await screen.findByRole("option", { name: /Errands/ });
    fireEvent.change(input(), { target: { value: NEW_TITLE } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /Create/ }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
