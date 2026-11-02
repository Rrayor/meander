import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { setWeekStart, weekStart } from "@/api/profiles";
import { WeekStartSection } from "@/features/settings/WeekStartSection";
import { Weekday } from "@/lib/enums";
import {
  SAVE_BUTTON_LABEL,
  WEEKDAY_OPTIONS,
  WEEK_START_LABEL,
} from "@/lib/labels";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  weekStart: vi.fn(),
  setWeekStart: vi.fn(),
}));

const mockedWeekStart = vi.mocked(weekStart);
const mockedSetWeekStart = vi.mocked(setWeekStart);

const dayLabel = (d: Weekday) =>
  WEEKDAY_OPTIONS.find((o) => o.value === d)!.label;

const combobox = () => screen.getByRole("combobox", { name: WEEK_START_LABEL });

// Base UI's select commits an item on pointerdown+click (mouse selection
// order); the trigger opens on a plain click — see Select.test.tsx.
const pickDay = async (day: Weekday) => {
  fireEvent.click(combobox());
  const option = await screen.findByRole("option", { name: dayLabel(day) });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
  await waitFor(() =>
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
  );
};

const renderSection = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <WeekStartSection />
    </QueryClientProvider>,
  );

describe("WeekStartSection", () => {
  beforeEach(() => {
    mockedWeekStart.mockReset().mockResolvedValue(Weekday.Monday);
    mockedSetWeekStart.mockReset().mockResolvedValue(undefined);
  });

  it("shows the stored weekday", async () => {
    mockedWeekStart.mockResolvedValue(Weekday.Sunday);
    renderSection();
    await waitFor(() =>
      expect(combobox()).toHaveTextContent(dayLabel(Weekday.Sunday)),
    );
  });

  it("sends the picked weekday on save", async () => {
    renderSection();
    await combobox();
    await pickDay(Weekday.Sunday);
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSetWeekStart).toHaveBeenCalledWith(
        Weekday.Sunday,
        expect.anything(),
      ),
    );
  });

  it("keeps Save disabled until a day is picked", async () => {
    renderSection();
    expect(
      await screen.findByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
  });

  it("keeps Save disabled when the stored value is re-picked", async () => {
    renderSection();
    await waitFor(() =>
      expect(combobox()).toHaveTextContent(dayLabel(Weekday.Monday)),
    );
    await pickDay(Weekday.Sunday);
    await pickDay(Weekday.Monday);
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
  });

  it("surfaces a failed save", async () => {
    const message = "write failed";
    mockedSetWeekStart.mockRejectedValue(new Error(message));
    renderSection();
    await combobox();
    await pickDay(Weekday.Sunday);
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
