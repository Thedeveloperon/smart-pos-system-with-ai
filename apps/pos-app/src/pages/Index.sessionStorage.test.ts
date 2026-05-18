import { beforeEach, describe, expect, it } from "vitest";
import { readCartDiscountFromSessionStorage, readCartItemsFromSessionStorage } from "./Index";

describe("Index session storage hydration", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("rehydrates cart items from session storage", () => {
    window.sessionStorage.setItem(
      "pos:cartItems",
      JSON.stringify([
        {
          lineId: "line-1",
          product: {
            id: "prod-1",
            name: "Ball Pen",
            sku: "BP-001",
            price: 60,
            stock: 20,
          },
          quantity: 2,
        },
      ]),
    );

    const items = readCartItemsFromSessionStorage();
    expect(items).toHaveLength(1);
    expect(items[0]?.lineId).toBe("line-1");
    expect(items[0]?.quantity).toBe(2);
  });

  it("rehydrates cart discount from session storage", () => {
    window.sessionStorage.setItem(
      "pos:cartDiscount",
      JSON.stringify({ cashierTransactionDiscountPercent: 5 }),
    );

    const discount = readCartDiscountFromSessionStorage();
    expect(discount.cashierTransactionDiscountPercent).toBe(5);
  });
});
