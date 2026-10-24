import { Weekday } from "@/lib/enums";
import { WEEKDAY_OPTIONS, weekdaysFrom } from "@/lib/labels";

describe("weekdaysFrom", () => {
  it("returns the canonical order for a Monday week start", () => {
    expect(weekdaysFrom(Weekday.Monday).map((o) => o.value)).toEqual(
      WEEKDAY_OPTIONS.map((o) => o.value),
    );
  });

  it("rotates Sunday to the front", () => {
    expect(weekdaysFrom(Weekday.Sunday).map((o) => o.value)).toEqual([
      Weekday.Sunday,
      ...WEEKDAY_OPTIONS.slice(0, -1).map((o) => o.value),
    ]);
  });

  it("contains every weekday exactly once for any start", () => {
    for (const { value } of WEEKDAY_OPTIONS) {
      expect(
        weekdaysFrom(value)
          .map((o) => o.value)
          .sort(),
      ).toEqual(WEEKDAY_OPTIONS.map((o) => o.value).sort());
    }
  });

  it("does not mutate the canonical Monday-first order", () => {
    weekdaysFrom(Weekday.Saturday);
    expect(WEEKDAY_OPTIONS[0].value).toBe(Weekday.Monday);
  });

  it("rotates a mid-week start to the front", () => {
    const rotated = weekdaysFrom(Weekday.Wednesday).map((o) => o.value);
    expect(rotated[0]).toBe(Weekday.Wednesday);
    expect(rotated.slice(-2)).toEqual([Weekday.Monday, Weekday.Tuesday]);
  });

  it("falls back to the canonical order for an unknown wire value", () => {
    expect(weekdaysFrom("bogus" as Weekday).map((o) => o.value)).toEqual(
      WEEKDAY_OPTIONS.map((o) => o.value),
    );
  });
});
