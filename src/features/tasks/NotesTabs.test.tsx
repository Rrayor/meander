import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { listSeriesNotes, listTaskNotes } from "@/api/notes";
import { NotesTabs } from "@/features/tasks/NotesTabs";
import {
  NOTE_COMPOSER_PLACEHOLDER,
  NOTES_EMPTY_MESSAGE,
  NOTES_TAB_INSTANCE_LABEL,
  NOTES_TAB_SERIES_LABEL,
} from "@/lib/labels";
import { testQueryClient } from "@/test/queryClient";

vi.mock("@/api/notes");

const TASK_ID = 7;
const SERIES_ID = 3;
const renderTabs = (
  taskId = TASK_ID,
  seriesId = SERIES_ID,
  client = testQueryClient(),
) =>
  render(
    <QueryClientProvider client={client}>
      <NotesTabs taskId={taskId} seriesId={seriesId} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.mocked(listTaskNotes).mockReset().mockResolvedValue([]);
  vi.mocked(listSeriesNotes).mockReset().mockResolvedValue([]);
});

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
  it("starts on the instance tab with both panels rendered", async () => {
    renderTabs();
    expect(instanceTab()).toHaveAttribute("aria-selected", "true");
    expect(seriesTab()).toHaveAttribute("aria-selected", "false");
    expect(instancePanel()).not.toHaveAttribute("hidden");
    expect(seriesPanel()).toHaveAttribute("hidden");
    await waitFor(() =>
      expect(screen.getAllByText(NOTES_EMPTY_MESSAGE)).toHaveLength(2),
    );
  });

  it("switches panels on click", () => {
    renderTabs();
    fireEvent.click(seriesTab());
    expect(seriesTab()).toHaveAttribute("aria-selected", "true");
    expect(instancePanel()).toHaveAttribute("hidden");
    expect(seriesPanel()).not.toHaveAttribute("hidden");
  });

  it("gives only the active tab a tab stop (roving tabindex)", () => {
    renderTabs();
    expect(instanceTab()).toHaveAttribute("tabindex", "0");
    expect(seriesTab()).toHaveAttribute("tabindex", "-1");
    fireEvent.click(seriesTab());
    expect(instanceTab()).toHaveAttribute("tabindex", "-1");
    expect(seriesTab()).toHaveAttribute("tabindex", "0");
  });

  it("arrow keys move focus and activate the adjacent tab", () => {
    renderTabs();
    instanceTab().focus();
    fireEvent.keyDown(instanceTab(), { key: "ArrowRight" });
    expect(seriesTab()).toHaveFocus();
    expect(seriesTab()).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(seriesTab(), { key: "ArrowLeft" });
    expect(instanceTab()).toHaveFocus();
    expect(instanceTab()).toHaveAttribute("aria-selected", "true");
  });

  it("arrow keys wrap around the ends of the tab list", () => {
    renderTabs();
    fireEvent.keyDown(instanceTab(), { key: "ArrowLeft" });
    expect(seriesTab()).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(seriesTab(), { key: "ArrowRight" });
    expect(instanceTab()).toHaveAttribute("aria-selected", "true");
  });

  it("drops an instance draft when the viewed instance changes", async () => {
    const client = testQueryClient();
    const { rerender } = renderTabs(TASK_ID, SERIES_ID, client);
    const composer = await within(instancePanel()).findByLabelText(
      NOTE_COMPOSER_PLACEHOLDER,
    );
    fireEvent.change(composer, { target: { value: "draft for monday" } });
    expect(composer).toHaveValue("draft for monday");
    // Picking another instance in the calendar rerenders NotesTabs with a
    // new taskId — the keyed NoteList remounts and the draft is gone.
    rerender(
      <QueryClientProvider client={client}>
        <NotesTabs taskId={TASK_ID + 1} seriesId={SERIES_ID} />
      </QueryClientProvider>,
    );
    expect(
      await within(instancePanel()).findByLabelText(NOTE_COMPOSER_PLACEHOLDER),
    ).toHaveValue("");
  });

  it("keeps a series draft when the viewed instance changes", async () => {
    const client = testQueryClient();
    const { rerender } = renderTabs(TASK_ID, SERIES_ID, client);
    fireEvent.click(seriesTab());
    const composer = await within(seriesPanel()).findByLabelText(
      NOTE_COMPOSER_PLACEHOLDER,
    );
    fireEvent.change(composer, { target: { value: "series-wide note" } });
    rerender(
      <QueryClientProvider client={client}>
        <NotesTabs taskId={TASK_ID + 1} seriesId={SERIES_ID} />
      </QueryClientProvider>,
    );
    expect(
      await within(seriesPanel()).findByLabelText(NOTE_COMPOSER_PLACEHOLDER),
    ).toHaveValue("series-wide note");
  });

  it("scopes each composer's aria-describedby to its own panel", async () => {
    renderTabs();
    for (const panel of [instancePanel(), seriesPanel()]) {
      const composer = await within(panel).findByLabelText(
        NOTE_COMPOSER_PLACEHOLDER,
      );
      fireEvent.submit(composer.closest("form")!);
      await waitFor(() => expect(composer).toHaveAttribute("aria-invalid"));
      const error = document.getElementById(
        composer.getAttribute("aria-describedby")!,
      );
      expect(panel.contains(error)).toBe(true);
    }
    // Both errors rendered at once and no duplicate IDs across panels.
    expect(instancePanel().querySelectorAll("[role='alert']")).toHaveLength(1);
    expect(seriesPanel().querySelectorAll("[role='alert']")).toHaveLength(1);
  });

  it("ignores keys that are not arrow keys", () => {
    renderTabs();
    fireEvent.keyDown(instanceTab(), { key: "Enter" });
    fireEvent.keyDown(instanceTab(), { key: "ArrowDown" });
    expect(instanceTab()).toHaveAttribute("aria-selected", "true");
  });
});
