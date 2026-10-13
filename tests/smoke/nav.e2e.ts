import { ROUTES } from "@/lib/routes";

describe("Meander smoke", () => {
  it("launches and navigates between pages", async () => {
    const nav = await $("aria/Main Navigation");
    await expect(nav).toExist();

    for (const { label } of ROUTES) {
      const link = await nav.$(`=${label}`);
      await link.click();
      await expect($("h1")).toHaveText(label);
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
