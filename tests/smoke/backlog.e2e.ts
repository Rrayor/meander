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
      'c.execute("DELETE FROM tasks");' +
      'c.execute("INSERT INTO tasks (profile_id, title, sort_order) VALUES " + sys.argv[2]);' +
      "c.commit();c.close()",
    dbPath,
    rows,
  ]);
}

describe("Backlog smoke", () => {
  it("paginates the backlog at 50 items on the real backend", async () => {
    const prefix = `SP${Date.now()}-`;
    seedTasks(prefix, PAGE_SIZE + 1);
    const row = (n: number) =>
      $(`button[aria-label='${editTaskLabel(`${prefix}${n}`)}']`);

    const nav = await $(`aria/${NAV_LABEL}`);
    const route = ROUTES.find(({ label }) => label === "Backlog")!;
    await nav.$(`=${route.label}`).click();
    await browser.waitUntil(async () => (await row(1)).isExisting(), {
      timeout: 10000,
    });
    await expect(await row(PAGE_SIZE + 1).isExisting()).toBe(false);
    await expect(
      await $(`nav[aria-label='${PAGINATION_LABEL}']`).isExisting(),
    ).toBe(true);

    await (await $(`button[aria-label='${PAGINATION_NEXT_LABEL}']`)).click();
    await browser.waitUntil(
      async () => (await row(PAGE_SIZE + 1)).isExisting(),
      {
        timeout: 10000,
      },
    );
    await expect(await row(PAGE_SIZE + 1).isExisting()).toBe(true);
    await expect(await row(1).isExisting()).toBe(false);

    await (
      await $(`button[aria-label='${PAGINATION_PREVIOUS_LABEL}']`)
    ).click();
    await browser.waitUntil(async () => (await row(1)).isExisting(), {
      timeout: 10000,
    });
    await expect(await row(1).isExisting()).toBe(true);
  });
});
