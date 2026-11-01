import { formatIsoDay } from "@/lib/utils";
import { BOARD_NEXT_WEEK_LABEL, CALENDAR_PREVIOUS_LABEL } from "@/lib/labels";
import {
  ADD_TASK_LABEL,
  BOARD_HEADING,
  CREATE_TASK_LABEL,
  NAV_LABEL,
  STATUS_LABELS,
  WEEKLY_BACKLOG_LABEL,
  MOVE_TO_BACKLOG_LABEL,
  addToWeekLabel,
  editTaskLabel,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

// Transitional selector: migrated dialogs render as portaled
// div[role='dialog'] popups while unmigrated ones stay native
// <dialog open> — the union matches either. Scope into it with :is().
const OPEN_DIALOG = "dialog, [role='dialog']";

// Real end-to-end path: the release build's webview hits the real
// SQLite backend — the board's column layout and the per-week
// materialization of a repeating task are exercised, not stubbed.
describe("Board smoke", () => {
  it("renders the weekly grid and materializes today's occurrence", async () => {
    const nav = await $(`aria/${NAV_LABEL}`);
    await browser.waitUntil(async () => {
      const headings = await $$("h1");
      try {
        return (await headings[0]?.getText()) === BOARD_HEADING;
      } catch {
        return false;
      }
    });

    // 8 columns (weekly backlog + 7 days) and 3 state rowheaders.
    const headers = await $$("th[scope='col']");
    expect(headers).toHaveLength(8);
    await expect(await $$("th[scope='row']")).toHaveLength(3);
    expect((await headers[0].getText()).includes(WEEKLY_BACKLOG_LABEL)).toBe(
      true,
    );
    for (const status of Object.values(STATUS_LABELS)) {
      await expect(await $(`th=${status}`)).toExist();
    }

    // A daily-repeating task has an occurrence today: the board read
    // materializes it through the real backend, and the card appears.
    const backlogRoute = ROUTES.find(({ label }) => label === "Backlog")!;
    const boardRoute = ROUTES.find(({ label }) => label === BOARD_HEADING)!;
    const title = `Board smoke ${Date.now()}`;
    await nav.$(`=${backlogRoute.label}`).then((l) => l.click());
    await (await $(`aria/${ADD_TASK_LABEL}`)).click();
    await (await $("#new-task-title-input")).setValue(title);
    // Expanding the repeat section emits a daily schedule by default.
    await (
      await $(`:is(${OPEN_DIALOG}) button[aria-controls$='-repeat-panel']`)
    ).click();
    await (await $(`aria/${CREATE_TASK_LABEL}`)).click();

    await nav.$(`=${boardRoute.label}`).then((l) => l.click());
    // A daily series materializes one card per day column — assert at
    // least one is present rather than matching a single element.
    await browser.waitUntil(
      async () => (await $$(`aria/${editTaskLabel(title)}`)).length > 0,
    );
  });

  it("jumps to a past week through the calendar popover", async () => {
    // Real backend: the week-range dropdown opens the popover; picking
    // a day two weeks back re-renders a past board — the weekly
    // backlog column is current-week only, so seven headers remain.
    const prior = new Date();
    prior.setDate(prior.getDate() - 14);
    const priorIso = `${prior.getFullYear()}-${String(
      prior.getMonth() + 1,
    ).padStart(2, "0")}-${String(prior.getDate()).padStart(2, "0")}`;

    await (await $$("header button"))[1].click();
    // The jump calendar opens on the anchor week's month — near a month
    // boundary the picked week needs navigating back to become visible.
    const dayButton = () => $(`aria/${formatIsoDay(priorIso)}`);
    for (let i = 0; i < 3 && !(await dayButton().isExisting()); i++) {
      await (await $(`aria/${CALENDAR_PREVIOUS_LABEL}`)).click();
    }
    await (await dayButton()).click();
    await browser.waitUntil(
      async () => (await $$("th[scope='col']")).length === 7,
    );
    const headers = await $$("th[scope='col']");
    expect(headers).toHaveLength(7);
    for (const h of headers) {
      expect((await h.getText()).includes(WEEKLY_BACKLOG_LABEL)).toBe(false);
    }
  });

  it("steps to a future week on the real backend", async () => {
    // Next-week arrow on the current board: the real list_week
    // materializes the future week and still excludes the standing
    // weekly backlog (spec §336/§354).
    const next = await $(`aria/${BOARD_NEXT_WEEK_LABEL}`);
    await next.click();
    await browser.waitUntil(
      async () => (await $$("th[scope='col']")).length === 7,
    );
    const headers = await $$("th[scope='col']");
    expect(headers).toHaveLength(7);
    for (const h of headers) {
      expect((await h.getText()).includes(WEEKLY_BACKLOG_LABEL)).toBe(false);
    }
  });
  it("creates a task from the board through the real backend", async () => {
    const title = `SmokeBoardTask-${Date.now()}`;

    // Unique per attempt — the sandbox DB persists across wdio retries.
    await (await $(`button=${ADD_TASK_LABEL}`)).click();
    const dialog = await $(OPEN_DIALOG);
    await browser.waitUntil(() => dialog.isDisplayed());
    await (await dialog.$("#new-task-title-input")).setValue(title);
    await (await dialog.$(`button=${CREATE_TASK_LABEL}`)).click();
    await browser.waitUntil(async () => !(await $(OPEN_DIALOG).isExisting()));

    // Board-created tasks land in the backlog — the real proof that the
    // create flowed through the backend is finding it there.
    const backlogRoute = ROUTES.find(({ label }) => label === "Backlog")!;
    const nav = await $(`aria/${NAV_LABEL}`);
    await nav.$(`=${backlogRoute.label}`).click();
    const createdRow = () => $(`button[aria-label='${editTaskLabel(title)}']`);
    await browser.waitUntil(async () => (await createdRow()).isExisting());
    await expect(await createdRow().isExisting()).toBe(true);
  });
  it("moves a task backlog → week → backlog on the real backend", async () => {
    const title = `SmokeMove-${Date.now()}`;
    const nav = await $(`aria/${NAV_LABEL}`);

    // Create from the board — lands in the backlog.
    await (await $(`button=${ADD_TASK_LABEL}`)).click();
    const dialog = () => $(OPEN_DIALOG);
    const noDialog = async () => (await $$(OPEN_DIALOG)).length === 0;
    await browser.waitUntil(async () => (await dialog()).isDisplayed());
    await (await (await dialog()).$("#new-task-title-input")).setValue(title);
    await (await (await dialog()).$(`button=${CREATE_TASK_LABEL}`)).click();
    await browser.waitUntil(noDialog, { timeout: 15000 });

    // On the backlog, the row's add-to-week action moves it onto the
    // board's weekly backlog column.
    const backlogRoute = ROUTES.find(({ label }) => label === "Backlog")!;
    const boardRoute = ROUTES.find(({ label }) => label === BOARD_HEADING)!;
    await nav.$(`=${backlogRoute.label}`).click();
    const addButton = () => $(`button[aria-label='${addToWeekLabel(title)}']`);
    await browser.waitUntil(async () => (await addButton()).isExisting(), {
      timeout: 10000,
    });
    await (await addButton()).click();
    await browser.waitUntil(
      async () =>
        (await $$(`button[aria-label='${addToWeekLabel(title)}']`)).length ===
        0,
      { timeout: 10000 },
    );

    // The card appears in the weekly backlog column.
    await nav.$(`=${boardRoute.label}`).click();
    const card = () => $(`aria/${editTaskLabel(title)}`);
    await browser.waitUntil(async () => (await card()).isExisting(), {
      timeout: 10000,
    });
    await expect(await card().isExisting()).toBe(true);

    // Move it back through the details view.
    await (await card()).click();
    await browser.waitUntil(async () => (await dialog()).isDisplayed());
    await (await (await dialog()).$(`button=${MOVE_TO_BACKLOG_LABEL}`)).click();
    await browser.waitUntil(noDialog, { timeout: 15000 });
    await browser.waitUntil(
      async () => (await $$(`aria/${editTaskLabel(title)}`)).length === 0,
      { timeout: 10000 },
    );

    // And it is back on the backlog page.
    await nav.$(`=${backlogRoute.label}`).click();
    await browser.waitUntil(async () => (await card()).isExisting(), {
      timeout: 10000,
    });
    await expect(await card().isExisting()).toBe(true);
  });
});
