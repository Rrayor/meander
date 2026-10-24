import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { setWorkDays, weekStart, workDays } from "@/api/profiles";
import { WorkDaysSection } from "@/features/settings/WorkDaysSection";
import { QUERY_KEYS } from "@/api/queryKeys";
import { Weekday } from "@/lib/enums";
import {
  SAVE_BUTTON_LABEL,
  WEEKDAY_OPTIONS,
  WORK_DAYS_DEFAULT,
  WORK_DAYS_FIELD_LABEL,
  weekdaysFrom,
} from "@/lib/labels";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  weekStart: vi.fn(),
  workDays: vi.fn(),
  setWorkDays: vi.fn(),
}));

const mockedWeekStart = vi.mocked(weekStart);
const mockedWorkDays = vi.mocked(workDays);
const mockedSetWorkDays = vi.mocked(setWorkDays);

const dayLabel = (d: Weekday) =>
  WEEKDAY_OPTIONS.find((o) => o.value === d)!.label;

const dayNames = new RegExp(
  `^(${WEEKDAY_OPTIONS.map((o) => o.label).join("|")})$`,
);
const chips = () => screen.getAllByRole("button", { name: dayNames });

const renderSection = () => {
  const client = testQueryClient();
  render(
    <QueryClientProvider client={client}>
      <WorkDaysSection />
    </QueryClientProvider>,
  );
  return client;
};

describe("WorkDaysSection", () => {
  beforeEach(() => {
    mockedWeekStart.mockReset().mockResolvedValue(Weekday.Monday);
    mockedWorkDays.mockReset().mockResolvedValue([...WORK_DAYS_DEFAULT]);
    mockedSetWorkDays.mockReset().mockResolvedValue(undefined);
  });

  it("shows the stored work days as pressed chips", async () => {
    mockedWorkDays.mockResolvedValue([Weekday.Saturday, Weekday.Sunday]);
    renderSection();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: dayLabel(Weekday.Saturday) }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(
      screen.getByRole("button", { name: dayLabel(Weekday.Monday) }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("orders chips from the configured week start", async () => {
    mockedWeekStart.mockResolvedValue(Weekday.Sunday);
    renderSection();
    await waitFor(() =>
      expect(chips().map((b) => b.getAttribute("aria-label"))).toEqual(
        weekdaysFrom(Weekday.Sunday).map((o) => o.label),
      ),
    );
  });

  it("sends the toggled set in canonical order on save", async () => {
    renderSection();
    await screen.findByRole("button", { name: dayLabel(Weekday.Monday) });
    fireEvent.click(
      screen.getByRole("button", { name: dayLabel(Weekday.Saturday) }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: dayLabel(Weekday.Friday) }),
    );
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSetWorkDays).toHaveBeenCalledWith(
        [
          Weekday.Monday,
          Weekday.Tuesday,
          Weekday.Wednesday,
          Weekday.Thursday,
          Weekday.Saturday,
        ],
        expect.anything(),
      ),
    );
  });

  it("keeps Save disabled until a chip is toggled", async () => {
    renderSection();
    expect(
      await screen.findByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
  });

  it("keeps Save disabled when the toggled set matches the stored one", async () => {
    renderSection();
    const friday = await screen.findByRole("button", {
      name: dayLabel(Weekday.Friday),
    });
    fireEvent.click(friday);
    fireEvent.click(friday);
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
  });

  it("does not allow deselecting the last work day", async () => {
    mockedWorkDays.mockResolvedValue([Weekday.Monday]);
    renderSection();
    const monday = await screen.findByRole("button", {
      name: dayLabel(Weekday.Monday),
    });
    // Wait for the stored set (Monday only) to replace the Mon–Fri default.
    await waitFor(() =>
      expect(
        chips().filter((b) => b.getAttribute("aria-pressed") === "true"),
      ).toHaveLength(1),
    );
    fireEvent.click(monday);
    expect(monday).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
    ).toBeDisabled();
    expect(mockedSetWorkDays).not.toHaveBeenCalled();
  });

  it("accumulates multiple toggles in the saved set", async () => {
    renderSection();
    await screen.findByRole("button", { name: dayLabel(Weekday.Monday) });
    fireEvent.click(
      screen.getByRole("button", { name: dayLabel(Weekday.Saturday) }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: dayLabel(Weekday.Sunday) }),
    );
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSetWorkDays).toHaveBeenCalledWith(
        [...WORK_DAYS_DEFAULT, Weekday.Saturday, Weekday.Sunday],
        expect.anything(),
      ),
    );
  });

  it("invalidates work days and the profile row after a save", async () => {
    const client = renderSection();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByRole("button", { name: dayLabel(Weekday.Monday) });
    fireEvent.click(
      screen.getByRole("button", { name: dayLabel(Weekday.Saturday) }),
    );
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: QUERY_KEYS.workDays }),
      ),
    );
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: QUERY_KEYS.profiles }),
    );
  });

  it("clears the draft once a save lands", async () => {
    renderSection();
    await screen.findByRole("button", { name: dayLabel(Weekday.Monday) });
    fireEvent.click(
      screen.getByRole("button", { name: dayLabel(Weekday.Saturday) }),
    );
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
      ).toBeDisabled(),
    );
    // The stored query refetches with the saved set once invalidated.
    expect(chips().length).toBe(WEEKDAY_OPTIONS.length);
  });

  it("exposes the field label as the group accessible name", async () => {
    renderSection();
    expect(
      await screen.findByRole("group", { name: WORK_DAYS_FIELD_LABEL }),
    ).toBeInTheDocument();
  });

  it("surfaces a failed save", async () => {
    const message = "write failed";
    mockedSetWorkDays.mockRejectedValue(new Error(message));
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", { name: dayLabel(Weekday.Saturday) }),
    );
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
