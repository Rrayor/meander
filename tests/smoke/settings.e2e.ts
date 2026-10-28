import {
  NAV_LABEL,
  SAVE_BUTTON_LABEL,
  THRESHOLD_FIELD_LABEL,
  THRESHOLD_HEADING_ID,
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

    const sundayOption = WEEKDAY_OPTIONS.find(
      (o) => o.value === Weekday.Sunday,
    )!;
    const globalMinutes = "240";
    const sundayMinutes = "720";
    const section = await $(
      `section[aria-labelledby='${THRESHOLD_HEADING_ID}']`,
    );
    const minutes = await section.$(`aria/${THRESHOLD_FIELD_LABEL}`);
    await minutes.setValue(globalMinutes);
    const sunday = await section.$(`aria/${sundayOption.label}`);
    await sunday.setValue(sundayMinutes);
    await (await section.$(`button=${SAVE_BUTTON_LABEL}`)).click();

    // A real round-trip: navigate away and back, the stored values reload.
    const boardRoute = ROUTES.find(({ label }) => label === "Board")!;
    await nav.$(`=${boardRoute.label}`).click();
    await nav.$(`=${settingsRoute.label}`).click();
    await browser.waitUntil(
      async () =>
        (await (
          await $(`section[aria-labelledby='${THRESHOLD_HEADING_ID}']`).$(
            `aria/${THRESHOLD_FIELD_LABEL}`,
          )
        ).getValue()) === globalMinutes,
    );
    expect(
      await (
        await $(`section[aria-labelledby='${THRESHOLD_HEADING_ID}']`).$(
          `aria/Sunday`,
        )
      ).getValue(),
    ).toBe("720");

    // Restore: clear the fields back to unset.
    await (
      await $(`section[aria-labelledby='${THRESHOLD_HEADING_ID}']`).$(
        `aria/${THRESHOLD_FIELD_LABEL}`,
      )
    ).clearValue();
    await (
      await $(`section[aria-labelledby='${THRESHOLD_HEADING_ID}']`).$(
        `aria/${sundayOption.label}`,
      )
    ).clearValue();
    await (
      await $(`section[aria-labelledby='${THRESHOLD_HEADING_ID}']`).$(
        `button=${SAVE_BUTTON_LABEL}`,
      )
    ).click();
    await browser.waitUntil(
      async () =>
        (await (
          await $(`section[aria-labelledby='${THRESHOLD_HEADING_ID}']`).$(
            `aria/${THRESHOLD_FIELD_LABEL}`,
          )
        ).getValue()) === "",
    );
  });
});
