import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ProductSearchPanel from "./ProductSearchPanel";
import type { Product } from "./types";

const products: Product[] = [
  { id: "1", name: "Ball Pen", sku: "SKU-001", barcode: "BAR-111", price: 100, stock: 10 },
  { id: "2", name: "Notebook", sku: "SKU-002", barcode: "BAR-222", price: 250, stock: 5 },
];

describe("ProductSearchPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("auto-adds an exact match in expert mode", async () => {
    const onAddToCart = vi.fn();

    render(
      <ProductSearchPanel
        products={products}
        cartItems={[]}
        onUpdateQty={vi.fn()}
        onRemove={vi.fn()}
        onAddToCart={onAddToCart}
        expertMode
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "SKU-001" } });

    await waitFor(() => {
      expect(onAddToCart).toHaveBeenCalledTimes(1);
      expect(onAddToCart).toHaveBeenCalledWith(products[0], 1);
    });
  });

  it("adds the first filtered result when Enter is pressed in expert mode", async () => {
    const onAddToCart = vi.fn();

    render(
      <ProductSearchPanel
        products={products}
        cartItems={[]}
        onUpdateQty={vi.fn()}
        onRemove={vi.fn()}
        onAddToCart={onAddToCart}
        expertMode
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "note" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(onAddToCart).toHaveBeenCalledTimes(1);
      expect(onAddToCart).toHaveBeenCalledWith(products[1], 1);
    });
  });
});
