import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CartItemRow from "./CartItemRow";
import type { CartItem } from "./types";

describe("CartItemRow", () => {
  it("shows a stock warning when the cart quantity exceeds available stock", () => {
    const item: CartItem = {
      product: {
        id: "prod-1",
        name: "Ball Pen",
        sku: "BP-001",
        price: 60,
        stock: 5,
      },
      quantity: 7,
    };

    render(
      <CartItemRow item={item} onUpdateQty={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Stock warning");
    expect(screen.getByText(/exceeds stock by 2/i)).toBeInTheDocument();
  });

  it("shows selected serial details and locks quantity controls", () => {
    const item: CartItem = {
      lineId: "serial:1",
      product: {
        id: "prod-serial-1",
        name: "Mirrorless Camera",
        sku: "CAM-001",
        price: 150000,
        stock: 1,
      },
      quantity: 1,
      selectedSerial: {
        id: "serial-1",
        value: "SN-0001",
      },
    };

    render(
      <CartItemRow item={item} onUpdateQty={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByText("Serial SN-0001")).toBeInTheDocument();
    expect(screen.getByText("Serial-selected item")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
