import { fireEvent, render, screen } from "@testing-library/react";

import { NotesTabs } from "@/features/tasks/NotesTabs";
import {
  NOTES_EMPTY_MESSAGE,
  NOTES_TAB_INSTANCE_LABEL,
  NOTES_TAB_SERIES_LABEL,
} from "@/lib/labels";

const instanceTab = () =>
  screen.getByRole("tab", { name: NOTES_TAB_INSTANCE_LABEL });
const seriesTab = () =>
  screen.getByRole("tab", { name: NOTES_TAB_SERIES_LABEL });
const instancePanel = () =>
  document.getElementById(
    instanceTab().getAttribute("aria-controls")!,
  ) as HTMLElement;
const seriesPanel = () =>
  document.getElementById(
    seriesTab().getAttribute("aria-controls")!,
  ) as HTMLElement;

describe("NotesTabs", () => {
  it("starts on the instance tab with both panels rendered", () => {
    render(<NotesTabs />);
    expect(instanceTab()).toHaveAttribute("aria-selected", "true");
    expect(seriesTab()).toHaveAttribute("aria-selected", "false");
    expect(instancePanel()).not.toHaveAttribute("hidden");
    expect(seriesPanel()).toHaveAttribute("hidden");
    expect(screen.getAllByText(NOTES_EMPTY_MESSAGE)).toHaveLength(2);
  });

  it("switches panels on click", () => {
    render(<NotesTabs />);
    fireEvent.click(seriesTab());
    expect(seriesTab()).toHaveAttribute("aria-selected", "true");
    expect(instancePanel()).toHaveAttribute("hidden");
    expect(seriesPanel()).not.toHaveAttribute("hidden");
  });

  it("gives only the active tab a tab stop (roving tabindex)", () => {
    render(<NotesTabs />);
    expect(instanceTab()).toHaveAttribute("tabindex", "0");
    expect(seriesTab()).toHaveAttribute("tabindex", "-1");
    fireEvent.click(seriesTab());
    expect(instanceTab()).toHaveAttribute("tabindex", "-1");
    expect(seriesTab()).toHaveAttribute("tabindex", "0");
  });

  it("arrow keys move focus and activate the adjacent tab", () => {
    render(<NotesTabs />);
    instanceTab().focus();
    fireEvent.keyDown(instanceTab(), { key: "ArrowRight" });
    expect(seriesTab()).toHaveFocus();
    expect(seriesTab()).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(seriesTab(), { key: "ArrowLeft" });
    expect(instanceTab()).toHaveFocus();
    expect(instanceTab()).toHaveAttribute("aria-selected", "true");
  });

  it("arrow keys wrap around the ends of the tab list", () => {
    render(<NotesTabs />);
    fireEvent.keyDown(instanceTab(), { key: "ArrowLeft" });
    expect(seriesTab()).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(seriesTab(), { key: "ArrowRight" });
    expect(instanceTab()).toHaveAttribute("aria-selected", "true");
  });

  it("ignores keys that are not arrow keys", () => {
    render(<NotesTabs />);
    fireEvent.keyDown(instanceTab(), { key: "Enter" });
    fireEvent.keyDown(instanceTab(), { key: "ArrowDown" });
    expect(instanceTab()).toHaveAttribute("aria-selected", "true");
  });
});
