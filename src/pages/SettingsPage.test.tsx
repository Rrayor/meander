import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { currentProfile, listProfiles, workDays } from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { currentDatabasePath } from "@/api/settings";
import { Weekday } from "@/lib/enums";
import { WEEKDAY_OPTIONS } from "@/lib/labels";
import { SettingsPage } from "@/pages/SettingsPage";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  listProfiles: vi.fn(),
  currentProfile: vi.fn(),
  weekStart: vi.fn(),
  workDays: vi.fn(),
}));

vi.mock("@/api/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/settings")>()),
  currentDatabasePath: vi.fn(),
}));

const profileA: Profile = {
  id: 1,
  name: "Default",
  created_at: "2026-10-01 08:00:00",
  updated_at: "2026-10-10 09:14:00",
};
const profileB: Profile = {
  id: 2,
  name: "Work",
  created_at: "2026-10-05 12:00:00",
  updated_at: "2026-10-05 12:00:00",
};

const dayLabel = (d: Weekday) =>
  WEEKDAY_OPTIONS.find((o) => o.value === d)!.label;

const pressedDayLabels = () =>
  screen
    .getAllByRole("button", { name: /day$/ })
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.getAttribute("aria-label"));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.mocked(listProfiles).mockReset().mockResolvedValue([profileA, profileB]);
    vi.mocked(currentProfile).mockReset().mockResolvedValue(profileA);
    vi.mocked(currentDatabasePath)
      .mockReset()
      .mockResolvedValue("/data/meander.db");
    vi.mocked(workDays).mockReset();
  });

  it("drops an unsaved work-days draft when the active profile changes", async () => {
    const client = testQueryClient();
    // Profile A works Monday only; profile B works the weekend.
    vi.mocked(workDays).mockResolvedValue([Weekday.Monday]);
    render(
      <QueryClientProvider client={client}>
        <SettingsPage />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(pressedDayLabels()).toEqual([dayLabel(Weekday.Monday)]),
    );

    // An unsaved toggle adds Saturday to the draft.
    fireEvent.click(
      screen.getByRole("button", { name: dayLabel(Weekday.Saturday) }),
    );
    expect(pressedDayLabels()).toEqual([
      dayLabel(Weekday.Monday),
      dayLabel(Weekday.Saturday),
    ]);

    // Switching profiles remounts the section: the draft is gone and the
    // new profile's stored days show instead.
    vi.mocked(workDays).mockResolvedValue([Weekday.Saturday, Weekday.Sunday]);
    await act(async () => {
      client.setQueryData(QUERY_KEYS.currentProfile, profileB);
      await client.invalidateQueries({ queryKey: QUERY_KEYS.workDays });
    });
    await waitFor(() =>
      expect(pressedDayLabels()).toEqual([
        dayLabel(Weekday.Saturday),
        dayLabel(Weekday.Sunday),
      ]),
    );
  });
});
