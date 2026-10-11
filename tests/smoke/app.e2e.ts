describe("Meander app", () => {
  it("launches and shows the heading", async () => {
    const heading = await browser.$("h1");
    await expect(await heading.getText()).toContain("Meander");
  });
});
