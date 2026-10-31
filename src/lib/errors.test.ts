import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/transport";
import {
  INSTANCE_DATE_NOT_SCHEDULED_MESSAGE,
  INSTANCE_DATE_OCCUPIED_MESSAGE,
  serverErrorMessage,
} from "@/lib/errors";

describe("serverErrorMessage", () => {
  it("maps an occupied destination to its copy", () => {
    expect(
      serverErrorMessage(
        new ApiError("instance_date_occupied", "validation", "raw"),
      ),
    ).toBe(INSTANCE_DATE_OCCUPIED_MESSAGE);
  });

  it("maps an unscheduled occurrence to its copy", () => {
    expect(
      serverErrorMessage(
        new ApiError("instance_date_not_scheduled", "validation", "raw"),
      ),
    ).toBe(INSTANCE_DATE_NOT_SCHEDULED_MESSAGE);
  });

  it("falls back to the raw message for unmapped codes", () => {
    expect(
      serverErrorMessage(new ApiError("internal", "internal", "boom")),
    ).toBe("boom");
  });
});
