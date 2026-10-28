import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listCategories, setCategoryThreshold } from "@/api/categories";
import { categoryFixture } from "@/test/fixtures";
import { testQueryClient } from "@/test/queryClient";
import {
  CATEGORY_THRESHOLDS_HEADING,
  SAVE_BUTTON_LABEL,
  categorySwatchLabel,
  thresholdColorLabel,
} from "@/lib/labels";
import { CategoryThresholdsSection } from "./CategoryThresholdsSection";

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
  setCategoryThreshold: vi.fn(),
}));
const mockedList = vi.mocked(listCategories);
const mockedSet = vi.mocked(setCategoryThreshold);

const renderSection = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <CategoryThresholdsSection />
    </QueryClientProvider>,
  );

const ERRANDS = categoryFixture({
  id: 1,
  title: "Errands",
  threshold_minutes: null,
  threshold_color: null,
});

beforeEach(() => {
  mockedList.mockReset();
  mockedSet.mockReset();
});

describe("CategoryThresholdsSection", () => {
  it("renders nothing when no categories exist", async () => {
    mockedList.mockResolvedValue([]);
    const { container } = renderSection();
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    expect(
      screen.queryByRole("heading", { name: CATEGORY_THRESHOLDS_HEADING }),
    ).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });

  it("shows the loading error instead of the section", async () => {
    mockedList.mockRejectedValue(new Error("db gone"));
    renderSection();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("offers no color pick for an unset category", async () => {
    mockedList.mockResolvedValue([ERRANDS]);
    renderSection();
    await screen.findByLabelText(thresholdColorLabel("Errands"));
    // With no minutes, a threshold has no color — no radios at all.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("lists categories and saves a threshold", async () => {
    mockedList.mockResolvedValue([ERRANDS]);
    renderSection();
    const input = await screen.findByLabelText(thresholdColorLabel("Errands"));
    fireEvent.change(input, { target: { value: "240" } });
    // pick a palette color
    fireEvent.click(
      screen.getByRole("radio", { name: categorySwatchLabel("#60a5fa") }),
    );
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith(1, 240, "#60a5fa"),
    );
  });

  it("blocks an out-of-range value and flags the field", async () => {
    mockedList.mockResolvedValue([ERRANDS]);
    renderSection();
    const input = await screen.findByLabelText(thresholdColorLabel("Errands"));
    fireEvent.change(input, { target: { value: "1441" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("clears a stored threshold back to null", async () => {
    mockedList.mockResolvedValue([
      categoryFixture({
        id: 2,
        title: "Home",
        threshold_minutes: 120,
        threshold_color: "#f87171",
      }),
    ]);
    renderSection();
    const input = await screen.findByLabelText(thresholdColorLabel("Home"));
    await waitFor(() => expect(input).toHaveValue(120));
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(2, null, null));
  });

  it("skips unchanged rows and surfaces a rejected save", async () => {
    mockedList.mockResolvedValue([
      ERRANDS,
      categoryFixture({
        id: 2,
        title: "Home",
        threshold_minutes: 120,
        threshold_color: "#f87171",
      }),
    ]);
    mockedSet.mockRejectedValueOnce(new Error("db read-only"));
    renderSection();
    const input = await screen.findByLabelText(thresholdColorLabel("Errands"));
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // Home was unchanged — only Errands was attempted.
    expect(mockedSet).toHaveBeenCalledTimes(1);
    expect(mockedSet).toHaveBeenCalledWith(1, 90, null);
  });
});
