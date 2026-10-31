import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

import { ROUTES } from "@/lib/routes";
import {
  NAV_LABEL,
  PAGE_SIZE,
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
});
