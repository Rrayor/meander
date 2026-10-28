import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { globalThreshold, setGlobalThreshold } from "@/api/profiles";
import {
  SAVE_BUTTON_LABEL,
  THRESHOLD_CLEAR_LABEL,
  THRESHOLD_COLOR_DEFAULT,
  THRESHOLD_DAYS_ERROR_ID,
  CUSTOM_COLOR_LABEL,
  CUSTOM_COLOR_PICKER_LABEL,
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
    mockedThreshold.mockResolvedValue({
      minutes: null,
      color: null,
      day_minutes: {},
    });
    renderSection();
    const input = await screen.findByLabelText(THRESHOLD_FIELD_LABEL);
    fireEvent.change(input, { target: { value: "240" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith(240, "#f87171", {}),
    );
  });

  it("saves a picked color alongside the minutes", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: null,
      color: null,
      day_minutes: {},
    });
    renderSection();
    fireEvent.change(await screen.findByLabelText(THRESHOLD_FIELD_LABEL), {
      target: { value: "60" },
    });
    fireEvent.change(await screen.findByLabelText(CUSTOM_COLOR_PICKER_LABEL), {
      target: { value: "#60a5fa" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith(60, "#60a5fa", {}),
    );
  });

  it("clearing an unset threshold stays disabled; clearing a set one saves nulls", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: null,
      color: null,
      day_minutes: {},
    });
    renderSection();
    expect(
      await screen.findByRole("button", { name: THRESHOLD_CLEAR_LABEL }),
    ).toBeDisabled();

    mockedThreshold.mockResolvedValue({
      minutes: 120,
      color: "#f87171",
      day_minutes: {},
    });
    renderSection();
    const clear = await screen.findAllByRole("button", {
      name: THRESHOLD_CLEAR_LABEL,
    });
    // The second render's button enables once the stored query lands.
    await waitFor(() => expect(clear[1]).toBeEnabled());
    fireEvent.click(clear[1]);
    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(null, null, {}));
  });

  it("keeps a cleared field empty instead of restoring the stored value", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: 480,
      color: "#f87171",
      day_minutes: {},
    });
    renderSection();
    const input = await screen.findByLabelText(THRESHOLD_FIELD_LABEL);
    await waitFor(() => expect(input).toHaveValue(480));
    // Clearing the input must NOT revive the stored 480 — saving the
    // empty field clears the threshold (same as the Clear button).
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith(null, THRESHOLD_COLOR_DEFAULT, {}),
    );
  });

  it("checks the custom radio when the stored color is off-palette", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: 120,
      color: "#123456",
      day_minutes: {},
    });
    renderSection();
    const custom = await screen.findByRole("radio", {
      name: CUSTOM_COLOR_LABEL,
    });
    // The off-palette stored color lands after the query resolves.
    await waitFor(() => expect(custom).toHaveAttribute("aria-checked", "true"));
    // No palette swatch claims selection for an off-palette color.
    for (const swatch of screen.getAllByRole("radio")) {
      if (swatch !== custom) {
        expect(swatch).toHaveAttribute("aria-checked", "false");
      }
    }
  });

  it("leaves Save disabled while nothing changed", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: 120,
      color: "#60a5fa",
      day_minutes: {},
    });
    renderSection();
    await screen.findByLabelText(THRESHOLD_FIELD_LABEL);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: SAVE_BUTTON_LABEL }),
      ).toBeDisabled(),
    );
  });

  it("sends a typed weekday override with the save", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: 240,
      color: THRESHOLD_COLOR_DEFAULT,
      day_minutes: {},
    });
    renderSection();
    const sunday = await screen.findByLabelText("Sunday");
    await waitFor(() => expect(sunday).toHaveAttribute("placeholder", "240"));
    fireEvent.change(sunday, { target: { value: "720" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith(240, THRESHOLD_COLOR_DEFAULT, {
        sunday: 720,
      }),
    );
  });

  it("marks an out-of-range day input and blocks the save", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: 240,
      color: THRESHOLD_COLOR_DEFAULT,
      day_minutes: {},
    });
    renderSection();
    const sunday = await screen.findByLabelText("Sunday");
    // Wait until the stored row lands — otherwise the first edit races the
    // values-driven reset and is wiped.
    await waitFor(() => expect(sunday).toHaveAttribute("placeholder", "240"));
    fireEvent.change(sunday, { target: { value: "1441" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() => expect(sunday).toHaveAttribute("aria-invalid", "true"));
    expect(sunday).toHaveAttribute("aria-describedby", THRESHOLD_DAYS_ERROR_ID);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("sends several typed days and omits cleared ones", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: 240,
      color: THRESHOLD_COLOR_DEFAULT,
      day_minutes: { monday: 300, sunday: 600 },
    });
    renderSection();
    const monday = await screen.findByLabelText("Monday");
    await waitFor(() => expect(monday).toHaveValue(300));
    const sunday = screen.getByLabelText("Sunday");
    const friday = screen.getByLabelText("Friday");
    // monday overridden, sunday cleared, friday added.
    fireEvent.change(monday, { target: { value: "360" } });
    fireEvent.change(sunday, { target: { value: "" } });
    fireEvent.change(friday, { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith(240, THRESHOLD_COLOR_DEFAULT, {
        monday: 360,
        friday: 120,
      }),
    );
  });

  it("saves a day-only threshold when global minutes are unset", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: null,
      color: null,
      day_minutes: {},
    });
    renderSection();
    const sunday = await screen.findByLabelText("Sunday");
    await waitFor(() => expect(mockedThreshold).toHaveBeenCalledTimes(1));
    await act(async () => {});
    fireEvent.change(sunday, { target: { value: "720" } });
    const save = screen.getByRole("button", { name: SAVE_BUTTON_LABEL });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith(null, THRESHOLD_COLOR_DEFAULT, {
        sunday: 720,
      }),
    );
  });

  it("surfaces a rejected save", async () => {
    mockedThreshold.mockResolvedValue({
      minutes: null,
      color: null,
      day_minutes: {},
    });
    mockedSet.mockRejectedValue(new Error("backend refused"));
    renderSection();
    fireEvent.change(await screen.findByLabelText(THRESHOLD_FIELD_LABEL), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON_LABEL }));
    await screen.findByRole("alert");
  });
});
