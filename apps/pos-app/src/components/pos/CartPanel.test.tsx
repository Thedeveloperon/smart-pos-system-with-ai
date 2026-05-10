import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CartPanel from "./CartPanel";
import type { CartItem } from "./types";

describe("CartPanel", () => {
  it("applies a product permanent fixed discount to the row and cart total", () => {
    const items: CartItem[] = [
      {
        product: {
          id: "prod-1",
          name: "Wipro Dry Iron 1000W",
          sku: "ELE-WIP-EWDI-001",
          price: 4890,
          stock: 10,
          permanentDiscountFixed: 500,
        },
        quantity: 1,
      },
    ];

    render(
      <CartPanel
        items={items}
        onUpdateQty={vi.fn()}
        onRemove={vi.fn()}
        onUpdateDiscount={vi.fn()}
        cartDiscount={{}}
      />,
    );

    expect(screen.getAllByText("Rs. 4,390")).toHaveLength(2);
    expect(screen.getAllByText("Discount: Rs. 500")).toHaveLength(2);
    expect(screen.getByText("Catalog discount: Rs. 500 on gross Rs. 4,890")).toBeInTheDocument();
  });
});
