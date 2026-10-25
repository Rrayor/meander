import { formatIsoDay } from "@/lib/utils";
import { BOARD_NEXT_WEEK_LABEL } from "@/lib/labels";
import {
  ADD_TASK_LABEL,
  BOARD_HEADING,
  CREATE_TASK_LABEL,
  NAV_LABEL,
  STATUS_LABELS,
  WEEKLY_BACKLOG_LABEL,
  editTaskLabel,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

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
      await $("dialog[open] button[aria-controls$='-repeat-panel']")
    ).click();
    await (await $(`aria/${CREATE_TASK_LABEL}`)).click();

    await nav.$(`=${boardRoute.label}`).then((l) => l.click());
    await browser.waitUntil(async () =>
      (await $(`aria/${editTaskLabel(title)}`)).isExisting(),
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
    await (await $(`aria/${formatIsoDay(priorIso)}`)).click();
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
});
