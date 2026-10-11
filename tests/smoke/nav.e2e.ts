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
    const switcher = await $("aside").$("aria/Default");
    await expect(switcher).toExist();
    await switcher.click();
    await expect($("ul[role='listbox']")).toExist();
  });
});
