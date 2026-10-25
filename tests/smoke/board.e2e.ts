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
});
