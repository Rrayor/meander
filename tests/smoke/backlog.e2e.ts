import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

import { PAGE_SIZE } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import {
  NAV_LABEL,
  MOVE_TO_DATE_LABEL,
  PAGINATION_LABEL,
  PAGINATION_NEXT_LABEL,
  PAGINATION_PREVIOUS_LABEL,
  editTaskLabel,
} from "@/lib/labels";

/// The smoke backend keeps its DB next to the sandbox binary — one level
/// up from the exported XDG_CONFIG_HOME.
const dbPath = join(dirname(process.env.XDG_CONFIG_HOME!), "meander.db");

/// Seeds page-size+1 tasks straight into the sandbox DB — creating them
/// through the UI is too slow and flaky for a smoke test. Deletes prior
/// seeds first so a spec retry stays deterministic.
function seedTasks(prefix: string, count: number) {
  const rows = Array.from(
    { length: count },
    (_, i) => `(1, '${prefix}${i + 1}', ${100000 + i})`,
  ).join(",");
  execFileSync("python3", [
    "-c",
    "import sqlite3,sys;" +
      "c=sqlite3.connect(sys.argv[1],timeout=10);" +
      `c.execute("DELETE FROM tasks WHERE title LIKE '${prefix}%'");` +
      'c.execute("INSERT INTO tasks (profile_id, title, sort_order) VALUES " + sys.argv[2]);' +
      "c.commit();c.close()",
    dbPath,
    rows,
  ]);
}

describe("Backlog smoke", () => {
  // Specs run serially on one sandbox DB — remove the seeds so the
  // next spec's tasks aren't pushed onto later pages.
  after(() => {
    execFileSync("python3", [
      "-c",
      "import sqlite3,sys;" +
        "c=sqlite3.connect(sys.argv[1],timeout=10);" +
        `c.execute("DELETE FROM tasks WHERE title LIKE 'SP%'");` +
        "c.commit();c.close()",
      dbPath,
    ]);
  });

  it("paginates the backlog at 50 items on the real backend", async () => {
    const prefix = `SP${Date.now()}-`;
    seedTasks(prefix, PAGE_SIZE + 1);

    const nav = await $(`aria/${NAV_LABEL}`);
    const route = ROUTES.find(({ label }) => label === "Backlog")!;
    await nav.$(`=${route.label}`).click();
    await browser.waitUntil(
      async () =>
        (await $(`nav[aria-label='${PAGINATION_LABEL}']`)).isExisting(),
      { timeout: 10000 },
    );

    // Leftover rows from other specs sort first; the seeds occupy
    // the tail — walk Next until it disables on the final page.
    const nextButton = () => $(`button[aria-label='${PAGINATION_NEXT_LABEL}']`);
    for (let i = 0; i < 20; i++) {
      if (!(await (await nextButton()).isEnabled())) break;
      await (await nextButton()).click();
    }
    const lastRow = () =>
      $(`button[aria-label='${editTaskLabel(`${prefix}${PAGE_SIZE + 1}`)}']`);
    await browser.waitUntil(async () => (await lastRow()).isExisting(), {
      timeout: 10000,
    });
    await expect(await lastRow().isExisting()).toBe(true);

    // And one page back hides it again.
    await (
      await $(`button[aria-label='${PAGINATION_PREVIOUS_LABEL}']`)
    ).click();
    await browser.waitUntil(
      async () =>
        (
          await $$(
            `button[aria-label='${editTaskLabel(`${prefix}${PAGE_SIZE + 1}`)}']`,
          )
        ).length === 0,
      { timeout: 10000 },
    );
  });

  it("schedules a backlog task for a date on the real backend", async () => {
    const title = `Sched-${Date.now()}`;
    seedTasks(title, 1);
    const row = () => $(`button[aria-label='${editTaskLabel(title)}1']`);

    const nav = await $(`aria/${NAV_LABEL}`);
    const route = ROUTES.find(({ label }) => label === "Backlog")!;
    // The prior spec leaves the backlog mounted with a cached list —
    // hop to the board and back so the remount refetches the seed.
    const boardRoute = ROUTES.find(({ label }) => label === "Board")!;
    await nav.$(`=${boardRoute.label}`).click();
    await nav.$(`=${route.label}`).click();
    await browser.waitUntil(async () => (await row()).isExisting(), {
      timeout: 10000,
    });
    await (await row()).click();
    const dialog = () => $("dialog");
    await browser.waitUntil(async () => (await dialog()).isDisplayed(), {
      timeout: 10000,
    });
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(now.getDate()).padStart(2, "0")}`;
    await (await (await dialog()).$(`input[type='date']`)).setValue(today);
    await (await (await dialog()).$(`button=${MOVE_TO_DATE_LABEL}`)).click();
    await browser.waitUntil(async () => (await $$("dialog")).length === 0, {
      timeout: 15000,
    });
    // Scheduled tasks leave the backlog list entirely (§24) — they are
    // dated board entities, so the card lands on today's column.
    await browser.waitUntil(
      async () =>
        (await $$(`button[aria-label='${editTaskLabel(title)}1']`)).length ===
        0,
      { timeout: 10000 },
    );
    await nav.$(`=${boardRoute.label}`).click();
    await browser.waitUntil(
      async () => (await $$(`aria/${editTaskLabel(title)}1`)).length > 0,
      { timeout: 10000 },
    );
    await expect(
      await $$(`button[aria-label='${editTaskLabel(title)}1']`),
    ).toHaveLength(0);
  });
});
