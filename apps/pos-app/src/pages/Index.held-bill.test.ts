import { describe, expect, it } from "vitest";
import { mergeHeldCartWithCurrentProducts } from "@/components/pos/heldCart";
import type { CartItem, Product } from "@/components/pos/types";

describe("mergeHeldCartWithCurrentProducts", () => {
  it("preserves held pricing while refreshing stock and normalizing the cart line id", () => {
    const heldItems: CartItem[] = [
      {
        saleItemId: "sale-item-1",
        lineId: "sale-item-1",
        product: {
          id: "prod-1",
          name: "Ball Pen",
          sku: "PEN-001",
          price: 80,
          stock: 2,
        },
        quantity: 3,
      },
    ];
    const currentProducts: Product[] = [
      {
        id: "prod-1",
        name: "Ball Pen Updated",
        sku: "PEN-001",
        price: 100,
        stock: 12,
      },
    ];

    const [item] = mergeHeldCartWithCurrentProducts(heldItems, currentProducts);

    expect(item.saleItemId).toBe("sale-item-1");
    expect(item.lineId).toBe("product:prod-1");
    expect(item.product.stock).toBe(12);
    expect(item.product.price).toBe(80);
    expect(item.product.name).toBe("Ball Pen");
  });

  it("falls back to the held snapshot when the current catalog item is unavailable", () => {
    const heldItems: CartItem[] = [
      {
        saleItemId: "sale-item-2",
        lineId: "sale-item-2",
        product: {
          id: "prod-2",
          name: "Notebook",
          sku: "NOTE-001",
          price: 250,
          stock: 1,
        },
        quantity: 1,
      },
    ];

    const [item] = mergeHeldCartWithCurrentProducts(heldItems, []);

    expect(item.lineId).toBe("product:prod-2");
    expect(item.product.stock).toBe(1);
    expect(item.product.price).toBe(250);
  });
});
