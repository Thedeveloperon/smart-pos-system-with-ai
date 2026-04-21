import { describe, expect, it } from "vitest";
import { buildChangeBreakdown, getDenominationShortages } from "./changeBreakdown";

describe("buildChangeBreakdown", () => {
  it("uses the available drawer counts when building change", () => {
    const breakdown = buildChangeBreakdown(370, [
      { denomination: 100, quantity: 1 },
      { denomination: 50, quantity: 1 },
      { denomination: 20, quantity: 1 },
      { denomination: 10, quantity: 2 },
      { denomination: 5, quantity: 0 },
      { denomination: 2, quantity: 0 },
      { denomination: 1, quantity: 0 },
    ]);

    expect(breakdown).toEqual([
      { denomination: 5000, quantity: 0 },
      { denomination: 2000, quantity: 0 },
      { denomination: 1000, quantity: 0 },
      { denomination: 500, quantity: 0 },
      { denomination: 100, quantity: 1 },
      { denomination: 50, quantity: 1 },
      { denomination: 20, quantity: 1 },
      { denomination: 10, quantity: 2 },
      { denomination: 5, quantity: 0 },
      { denomination: 2, quantity: 0 },
      { denomination: 1, quantity: 0 },
    ]);
  });

  it("caps the change by the available notes and coins", () => {
    const breakdown = buildChangeBreakdown(370, [
      { denomination: 100, quantity: 1 },
      { denomination: 50, quantity: 1 },
      { denomination: 20, quantity: 1 },
      { denomination: 10, quantity: 0 },
      { denomination: 5, quantity: 0 },
      { denomination: 2, quantity: 0 },
      { denomination: 1, quantity: 0 },
    ]);

    expect(breakdown).toEqual([
      { denomination: 5000, quantity: 0 },
      { denomination: 2000, quantity: 0 },
      { denomination: 1000, quantity: 0 },
      { denomination: 500, quantity: 0 },
      { denomination: 100, quantity: 1 },
      { denomination: 50, quantity: 1 },
      { denomination: 20, quantity: 1 },
      { denomination: 10, quantity: 0 },
      { denomination: 5, quantity: 0 },
      { denomination: 2, quantity: 0 },
      { denomination: 1, quantity: 0 },
    ]);
  });

  it("detects when the selected denominations exceed drawer availability", () => {
    const shortages = getDenominationShortages(
      [
        { denomination: 10, quantity: 2 },
        { denomination: 5, quantity: 1 },
      ],
      [
        { denomination: 10, quantity: 1 },
        { denomination: 5, quantity: 1 },
      ],
    );

    expect(shortages).toEqual([
      {
        denomination: 10,
        selectedQuantity: 2,
        availableQuantity: 1,
        shortage: 1,
      },
    ]);
  });
});
