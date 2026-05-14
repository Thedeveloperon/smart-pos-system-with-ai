import { describe, expect, it } from "vitest";
import type { CartItem, Product } from "@/components/pos/types";
import { computeCartTotals } from "./cartMath";

function buildProduct(overrides?: Partial<Product>): Product {
  return {
    id: "product-1",
    name: "Test Product",
    sku: "TEST-1",
    price: 100,
    stock: 10,
    ...overrides,
  };
}

function buildItem(productOverrides?: Partial<Product>): CartItem {
  return {
    product: buildProduct(productOverrides),
    quantity: 1,
  };
}

describe("computeCartTotals catalog discount resolution", () => {
  it("prioritizes active promotion over permanent product discounts", () => {
    const totals = computeCartTotals(
      [
        buildItem({
          activePromotionDiscountType: "fixed",
          activePromotionDiscountValue: 20,
          permanentDiscountFixed: 40,
        }),
      ],
      {},
    );

    expect(totals.lines[0].catalogDiscountAmount).toBe(20);
    expect(totals.lines[0].lineTotal).toBe(80);
  });

  it("clamps percentage promotion discount to line gross", () => {
    const totals = computeCartTotals(
      [
        buildItem({
          activePromotionDiscountType: "percent",
          activePromotionDiscountValue: 300,
        }),
      ],
      {},
    );

    expect(totals.lines[0].catalogDiscountAmount).toBe(100);
    expect(totals.lines[0].lineTotal).toBe(0);
  });

  it("clamps fixed promotion discount to line gross", () => {
    const totals = computeCartTotals(
      [
        buildItem({
          activePromotionDiscountType: "fixed",
          activePromotionDiscountValue: 250,
        }),
      ],
      {},
    );

    expect(totals.lines[0].catalogDiscountAmount).toBe(100);
    expect(totals.lines[0].lineTotal).toBe(0);
  });

  it("falls back to permanent discounts when no active promotion exists", () => {
    const totals = computeCartTotals(
      [
        buildItem({
          permanentDiscountPercent: 10,
        }),
      ],
      {},
    );

    expect(totals.lines[0].catalogDiscountAmount).toBe(10);
    expect(totals.lines[0].lineTotal).toBe(90);
  });
});
