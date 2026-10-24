import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { setWeekStart, weekStart } from "@/api/profiles";
import { WeekStartSection } from "@/features/settings/WeekStartSection";
import { Weekday } from "@/lib/enums";
import { SAVE_BUTTON_LABEL, WEEK_START_LABEL } from "@/lib/labels";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  weekStart: vi.fn(),
  setWeekStart: vi.fn(),
}));

const mockedWeekStart = vi.mocked(weekStart);
const mockedSetWeekStart = vi.mocked(setWeekStart);

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
    const select = await screen.findByLabelText(WEEK_START_LABEL);
    await waitFor(() => expect(select).toHaveValue(Weekday.Sunday));
  });

  it("sends the picked weekday on save", async () => {
    renderSection();
    fireEvent.change(await screen.findByLabelText(WEEK_START_LABEL), {
      target: { value: Weekday.Sunday },
    });
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

  it("surfaces a failed save", async () => {
    const message = "write failed";
    mockedSetWeekStart.mockRejectedValue(new Error(message));
    renderSection();
    fireEvent.change(await screen.findByLabelText(WEEK_START_LABEL), {
      target: { value: Weekday.Sunday },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
