import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listCategories, setCategoryThresholds } from "@/api/categories";
import { categoryFixture } from "@/test/fixtures";
import { testQueryClient } from "@/test/queryClient";
import { Weekday } from "@/lib/enums";
import {
  CATEGORY_THRESHOLDS_HEADING,
  WEEKDAY_OPTIONS,
  SAVE_BUTTON_LABEL,
  categorySwatchLabel,
  categoryThresholdDayLabel,
  thresholdColorLabel,
} from "@/lib/labels";
import { CategoryThresholdsSection } from "./CategoryThresholdsSection";

vi.mock("@/api/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/categories")>()),
  listCategories: vi.fn(),
  setCategoryThresholds: vi.fn(),
}));
const mockedList = vi.mocked(listCategories);
const mockedSet = vi.mocked(setCategoryThresholds);

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
  threshold_day_minutes: {},
});

const dayLabel = (w: Weekday) =>
  WEEKDAY_OPTIONS.find((o) => o.value === w)!.label;
const SUNDAY_MINUTES = "720";
const MONDAY_MINUTES = "60";
const FRIDAY_MINUTES = "45";

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
    await screen.findByLabelText(thresholdColorLabel(ERRANDS.title));
    // With no minutes, a threshold has no color — no radios at all.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("lists categories and saves a threshold", async () => {
    mockedList.mockResolvedValue([ERRANDS]);
    renderSection();
    const input = await screen.findByLabelText(
      thresholdColorLabel(ERRANDS.title),
    );
    fireEvent.change(input, { target: { value: "240" } });
    // pick a palette color
    fireEvent.click(
      screen.getByRole("radio", { name: categorySwatchLabel("#60a5fa") }),
    );
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith([
        { category_id: 1, minutes: 240, color: "#60a5fa", day_minutes: {} },
      ]),
    );
  });

  it("blocks an out-of-range value and flags the field", async () => {
    mockedList.mockResolvedValue([ERRANDS]);
    renderSection();
    const input = await screen.findByLabelText(
      thresholdColorLabel(ERRANDS.title),
    );
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
        threshold_day_minutes: {},
      }),
    ]);
    renderSection();
    const input = await screen.findByLabelText(thresholdColorLabel("Home"));
    await waitFor(() => expect(input).toHaveValue(120));
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith([
        { category_id: 2, minutes: null, color: null, day_minutes: {} },
      ]),
    );
  });

  it("skips unchanged rows and surfaces a rejected save", async () => {
    mockedList.mockResolvedValue([
      ERRANDS,
      categoryFixture({
        id: 2,
        title: "Home",
        threshold_minutes: 120,
        threshold_color: "#f87171",
        threshold_day_minutes: {},
      }),
    ]);
    mockedSet.mockRejectedValueOnce(new Error("db read-only"));
    renderSection();
    const input = await screen.findByLabelText(
      thresholdColorLabel(ERRANDS.title),
    );
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // Home was unchanged — only Errands was attempted.
    expect(mockedSet).toHaveBeenCalledTimes(1);
    expect(mockedSet).toHaveBeenCalledWith([
      { category_id: 1, minutes: 90, color: null, day_minutes: {} },
    ]);
  });

  it("saves a per-weekday override with the row", async () => {
    mockedList.mockResolvedValue([ERRANDS]);
    renderSection();
    const sunday = await screen.findByLabelText(
      categoryThresholdDayLabel(ERRANDS.title, dayLabel(Weekday.Sunday)),
    );
    fireEvent.change(sunday, { target: { value: SUNDAY_MINUTES } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith([
        {
          category_id: 1,
          minutes: null,
          color: null,
          day_minutes: { [Weekday.Sunday]: Number(SUNDAY_MINUTES) },
        },
      ]),
    );
  });

  it("hydrates stored weekday overrides into the inputs", async () => {
    mockedList.mockResolvedValue([
      categoryFixture({
        id: ERRANDS.id,
        title: ERRANDS.title,
        threshold_minutes: 240,
        threshold_color: "#60a5fa",
        threshold_day_minutes: {
          [Weekday.Sunday]: Number(SUNDAY_MINUTES),
          [Weekday.Monday]: Number(MONDAY_MINUTES),
        },
      }),
    ]);
    renderSection();
    const sunday = await screen.findByLabelText(
      categoryThresholdDayLabel(ERRANDS.title, dayLabel(Weekday.Sunday)),
    );
    const monday = await screen.findByLabelText(
      categoryThresholdDayLabel(ERRANDS.title, dayLabel(Weekday.Monday)),
    );
    const tuesday = await screen.findByLabelText(
      categoryThresholdDayLabel(ERRANDS.title, dayLabel(Weekday.Tuesday)),
    );
    await waitFor(() => {
      expect(sunday).toHaveValue(Number(SUNDAY_MINUTES));
      expect(monday).toHaveValue(Number(MONDAY_MINUTES));
      expect(tuesday).toHaveValue(null);
    });
  });

  it("omits a cleared weekday from the payload", async () => {
    mockedList.mockResolvedValue([
      categoryFixture({
        id: ERRANDS.id,
        title: ERRANDS.title,
        threshold_minutes: 240,
        threshold_color: "#60a5fa",
        threshold_day_minutes: {
          [Weekday.Sunday]: Number(SUNDAY_MINUTES),
          [Weekday.Monday]: Number(MONDAY_MINUTES),
        },
      }),
    ]);
    renderSection();
    const sunday = await screen.findByLabelText(
      categoryThresholdDayLabel(ERRANDS.title, dayLabel(Weekday.Sunday)),
    );
    await waitFor(() => expect(sunday).toHaveValue(720));
    fireEvent.change(sunday, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith([
        {
          category_id: 1,
          minutes: 240,
          color: "#60a5fa",
          day_minutes: { [Weekday.Monday]: Number(MONDAY_MINUTES) },
        },
      ]),
    );
  });

  it("marks a row dirty on a day-only edit and keeps it on a failed batch", async () => {
    mockedList.mockResolvedValue([ERRANDS]);
    mockedSet.mockRejectedValueOnce(new Error("db read-only"));
    renderSection();
    const friday = await screen.findByLabelText(
      categoryThresholdDayLabel(ERRANDS.title, dayLabel(Weekday.Friday)),
    );
    fireEvent.change(friday, { target: { value: FRIDAY_MINUTES } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // The failed batch must not reset the form — the edit survives.
    expect(friday).toHaveValue(Number(FRIDAY_MINUTES));
    expect(mockedSet).toHaveBeenCalledWith([
      {
        category_id: 1,
        minutes: null,
        color: null,
        day_minutes: { [Weekday.Friday]: Number(FRIDAY_MINUTES) },
      },
    ]);
  });

  it("shows the color picker for a day-only threshold", async () => {
    mockedList.mockResolvedValue([ERRANDS]);
    renderSection();
    const friday = await screen.findByLabelText(
      categoryThresholdDayLabel(ERRANDS.title, dayLabel(Weekday.Friday)),
    );
    // No base minutes, but a day override is still a threshold —
    // the color control must not vanish (spec §285/§297).
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    fireEvent.change(friday, { target: { value: FRIDAY_MINUTES } });
    await waitFor(() =>
      expect(screen.getAllByRole("radio").length).toBeGreaterThan(0),
    );
  });

  it("blocks an out-of-range weekday value and flags the input", async () => {
    mockedList.mockResolvedValue([ERRANDS]);
    renderSection();
    const monday = await screen.findByLabelText(
      categoryThresholdDayLabel(ERRANDS.title, dayLabel(Weekday.Monday)),
    );
    fireEvent.change(monday, { target: { value: "1441" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0),
    );
    expect(mockedSet).not.toHaveBeenCalled();
    expect(monday).toHaveAttribute("aria-invalid", "true");
  });
});
