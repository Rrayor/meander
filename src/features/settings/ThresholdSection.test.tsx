import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { globalThreshold, setGlobalThreshold } from "@/api/profiles";
import {
  SAVE_BUTTON_LABEL,
  THRESHOLD_CLEAR_LABEL,
  THRESHOLD_COLOR_LABEL,
  THRESHOLD_FIELD_LABEL,
} from "@/lib/labels";
import { ThresholdSection } from "@/features/settings/ThresholdSection";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/profiles")>()),
  globalThreshold: vi.fn(),
  setGlobalThreshold: vi.fn(),
}));

const mockedThreshold = vi.mocked(globalThreshold);
const mockedSet = vi.mocked(setGlobalThreshold);

const renderSection = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <ThresholdSection />
    </QueryClientProvider>,
  );

beforeEach(() => {
  mockedThreshold.mockReset();
  mockedSet.mockReset();
  mockedSet.mockResolvedValue(undefined);
});

describe("ThresholdSection", () => {
  it("saves a picked minutes value with the default color", async () => {
    mockedThreshold.mockResolvedValue({ minutes: null, color: null });
    renderSection();
    const input = await screen.findByLabelText(THRESHOLD_FIELD_LABEL);
    fireEvent.change(input, { target: { value: "240" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(240, "#f87171"));
  });

  it("saves a picked color alongside the minutes", async () => {
    mockedThreshold.mockResolvedValue({ minutes: null, color: null });
    renderSection();
    fireEvent.change(await screen.findByLabelText(THRESHOLD_FIELD_LABEL), {
      target: { value: "60" },
    });
    fireEvent.change(await screen.findByLabelText(THRESHOLD_COLOR_LABEL), {
      target: { value: "#60a5fa" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(60, "#60a5fa"));
  });

  it("clearing an unset threshold stays disabled; clearing a set one saves nulls", async () => {
    mockedThreshold.mockResolvedValue({ minutes: null, color: null });
    renderSection();
    expect(
      await screen.findByRole("button", { name: THRESHOLD_CLEAR_LABEL }),
    ).toBeDisabled();

    mockedThreshold.mockResolvedValue({ minutes: 120, color: "#f87171" });
    renderSection();
    const clear = await screen.findAllByRole("button", {
      name: THRESHOLD_CLEAR_LABEL,
    });
    // The second render's button enables once the stored query lands.
    await waitFor(() => expect(clear[1]).toBeEnabled());
    fireEvent.click(clear[1]);
    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(null, null));
  });

  it("surfaces a rejected save", async () => {
    mockedThreshold.mockResolvedValue({ minutes: null, color: null });
    mockedSet.mockRejectedValue(new Error("backend refused"));
    renderSection();
    fireEvent.change(await screen.findByLabelText(THRESHOLD_FIELD_LABEL), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await screen.findByRole("alert");
  });
});
