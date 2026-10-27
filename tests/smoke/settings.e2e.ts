import {
  NAV_LABEL,
  SAVE_BUTTON_LABEL,
  THRESHOLD_FIELD_LABEL,
  THRESHOLD_HEADING,
  WEEKDAY_OPTIONS,
  WORK_DAYS_HEADING_ID,
} from "@/lib/labels";
import { ROUTES } from "@/lib/routes";
import { Weekday } from "@/lib/enums";

// Real end-to-end path: the release build's settings page writes work days
// through set_work_days into SQLite — no stubs.
describe("Settings smoke", () => {
  it("persists a work-days change through the real backend", async () => {
    const settingsRoute = ROUTES.find(({ label }) => label === "Settings")!;
    const nav = await $(`aria/${NAV_LABEL}`);
    await expect(nav).toExist();
    await nav.$(`=${settingsRoute.label}`).click();

    const section = await $(
      `section[aria-labelledby='${WORK_DAYS_HEADING_ID}']`,
    );
    await expect(section).toExist();
    const saturday = WEEKDAY_OPTIONS.find((o) => o.value === Weekday.Saturday)!;
    const chip = await section.$(`aria/${saturday.label}`);
    await chip.click();
    await (await section.$(`button=${SAVE_BUTTON_LABEL}`)).click();

    // The save clears the draft — the pressed state now comes from the
    // refetched stored set, i.e. real persistence.
    await browser.waitUntil(
      async () =>
        (await chip.getAttribute("aria-pressed")) === "true" &&
        (await section
          .$(`button=${SAVE_BUTTON_LABEL}`)
          .getAttribute("disabled")) !== null,
    );

    // Restore the default so the shared test DB stays Mon–Fri.
    await chip.click();
    await (await section.$(`button=${SAVE_BUTTON_LABEL}`)).click();
    await browser.waitUntil(
      async () => (await chip.getAttribute("aria-pressed")) === "false",
    );
  });

  it("persists a per-weekday threshold override through the real backend", async () => {
    const settingsRoute = ROUTES.find(({ label }) => label === "Settings")!;
    const nav = await $(`aria/${NAV_LABEL}`);
    await nav.$(`=${settingsRoute.label}`).click();

    const section = await $(`aria/${THRESHOLD_HEADING}`);
    const minutes = await section.$(`aria/${THRESHOLD_FIELD_LABEL}`);
    await minutes.setValue("240");
    const sunday = await section.$(`aria/Sunday`);
    await sunday.setValue("720");
    await (await section.$(`button=${SAVE_BUTTON_LABEL}`)).click();

    // A real round-trip: navigate away and back, the stored values reload.
    const boardRoute = ROUTES.find(({ label }) => label === "Board")!;
    await nav.$(`=${boardRoute.label}`).click();
    await nav.$(`=${settingsRoute.label}`).click();
    await browser.waitUntil(
      async () =>
        (await (
          await $(`aria/${THRESHOLD_HEADING}`).$(
            `aria/${THRESHOLD_FIELD_LABEL}`,
          )
        ).getValue()) === "240",
    );
    expect(
      await (await $(`aria/${THRESHOLD_HEADING}`).$(`aria/Sunday`)).getValue(),
    ).toBe("720");

    // Restore: clear the fields back to unset.
    await (
      await $(`aria/${THRESHOLD_HEADING}`).$(`aria/${THRESHOLD_FIELD_LABEL}`)
    ).setValue("");
    await (await $(`aria/${THRESHOLD_HEADING}`).$(`aria/Sunday`)).setValue("");
    await (
      await $(`aria/${THRESHOLD_HEADING}`).$(`button=${SAVE_BUTTON_LABEL}`)
    ).click();
    await browser.waitUntil(
      async () =>
        (await (
          await $(`aria/${THRESHOLD_HEADING}`).$(
            `aria/${THRESHOLD_FIELD_LABEL}`,
          )
        ).getValue()) === "",
    );
  });
});
