import { describe, expect, it } from "vitest";
import { formatDateTimeLocal, parseDateTimeLocal } from "./PromotionsTab";

describe("PromotionsTab date-time helpers", () => {
  it("round-trips a UTC timestamp through datetime-local without shifting", () => {
    const utcValue = "2026-05-14T20:20:00.000Z";
    const localValue = formatDateTimeLocal(utcValue);

    expect(localValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(parseDateTimeLocal(localValue)).toBe("2026-05-14T20:20:00.000Z");
  });

  it("returns an empty string for invalid local input", () => {
    expect(parseDateTimeLocal("")).toBe("");
  });
});
