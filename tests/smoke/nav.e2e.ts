import { NAV_LABEL } from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

describe("Meander smoke", () => {
  it("launches and navigates between pages", async () => {
    const nav = await $(`aria/${NAV_LABEL}`);
    await expect(nav).toExist();

    for (const { label } of ROUTES) {
      const link = await nav.$(`=${label}`);
      await link.click();
      // Re-query inside waitUntil: React re-renders as queries resolve, so a
      // cached element handle can go stale between findElements and use.
      await browser.waitUntil(async () => {
        const headings = await $$("h1");
        try {
          return (await headings[0]?.getText()) === label;
        } catch {
          return false;
        }
      });
    }
  });

  it("shows the active profile in the footer switcher", async () => {
    const switcher = await $("aside button[aria-haspopup='menu']");
    await expect(switcher).toExist();
    const aside = await $("aside");
    await browser.waitUntil(async () =>
      (await aside.getHTML()).includes(">Default<"),
    );
    await switcher.click();
    await expect($("aside ul[role='menu']")).toExist();
  });
});
