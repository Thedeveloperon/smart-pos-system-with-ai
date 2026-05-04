import { describe, expect, it } from "vitest";
import { getDefaultUnitCostEstimate } from "./PurchaseOrderSheet";

describe("getDefaultUnitCostEstimate", () => {
  it("prefers product cost price over selling price when defaulting PO unit cost", () => {
    expect(
      getDefaultUnitCostEstimate({
        cost_price: 3594.456,
        costPrice: 3594.456,
        unit_price: 4999,
        price: 4999,
      }),
    ).toBe(3594.46);
  });

  it("falls back safely when cost price is unavailable", () => {
    expect(getDefaultUnitCostEstimate({ unit_price: 1200, price: 999 })).toBe(1200);
    expect(getDefaultUnitCostEstimate(undefined)).toBe(0);
  });
});
