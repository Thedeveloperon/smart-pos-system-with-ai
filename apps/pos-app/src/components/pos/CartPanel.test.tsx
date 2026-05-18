import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CartPanel from "./CartPanel";
import type { CartItem } from "./types";

const sampleItem: CartItem = {
  lineId: "line-1",
  product: {
    id: "prod-1",
    name: "Ball Pen",
    sku: "BP-001",
    price: 60,
    stock: 20,
  },
  quantity: 1,
};

describe("CartPanel", () => {
  it("shows clear button and triggers callback when cart has items", () => {
    const onClear = vi.fn();

    render(
      <CartPanel
        items={[sampleItem]}
        onUpdateQty={vi.fn()}
        onRemove={vi.fn()}
        onUpdateDiscount={vi.fn()}
        cartDiscount={{}}
        onClear={onClear}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("hides clear button when cart is empty", () => {
    render(
      <CartPanel
        items={[]}
        onUpdateQty={vi.fn()}
        onRemove={vi.fn()}
        onUpdateDiscount={vi.fn()}
        cartDiscount={{}}
        onClear={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});
