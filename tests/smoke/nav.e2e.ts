describe("Meander smoke", () => {
  it("launches and navigates between pages", async () => {
    const nav = await $("aria/Main Navigation");
    await expect(nav).toExist();

    const boardLink = await nav.$("=Board");
    await boardLink.click();
    await expect($("h1")).toHaveText("Board");

    const backlogLink = await nav.$("=Backlog");
    await backlogLink.click();
    await expect($("h1")).toHaveText("Backlog");
  });
});
