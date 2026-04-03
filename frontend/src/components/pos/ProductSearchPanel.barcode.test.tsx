import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProductSearchPanel, { type ProductSearchPanelHandle } from "./ProductSearchPanel";
import type { Product } from "./types";

const sampleProducts: Product[] = [
  {
    id: "prod-1",
    name: "Milk 1L",
    sku: "MILK-1L",
    barcode: "1234567890128",
    price: 450,
    stock: 20,
  },
];

describe("ProductSearchPanel barcode mode", () => {
  it("adds exact barcode match to cart when Enter is pressed in barcode mode", () => {
    const onAddToCart = vi.fn();

    render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to barcode mode" }));
    const input = screen.getByPlaceholderText("Scan or enter barcode...");

    fireEvent.change(input, { target: { value: "1234567890128" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onAddToCart).toHaveBeenCalledWith(sampleProducts[0], 1);
    expect(input).toHaveValue("");
  });

  it("shows clear no-match feedback for scanner-like bursts", () => {
    const onAddToCart = vi.fn();

    render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to barcode mode" }));
    const input = screen.getByPlaceholderText("Scan or enter barcode...");

    for (const key of "9999999999999") {
      fireEvent.keyDown(input, { key });
    }
    fireEvent.change(input, { target: { value: "9999999999999" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onAddToCart).not.toHaveBeenCalled();
    expect(screen.getByText('No product matched scanned barcode "9999999999999".')).toBeInTheDocument();
  });

  it("does not auto-add product on Enter in manual mode", () => {
    const onAddToCart = vi.fn();

    render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

    const input = screen.getByPlaceholderText("Search products by name, SKU...");
    fireEvent.change(input, { target: { value: "Milk" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onAddToCart).not.toHaveBeenCalled();
  });

  it("supports focusSearch imperative handle for shortcut focus behavior", () => {
    const onAddToCart = vi.fn();
    const panelRef = createRef<ProductSearchPanelHandle>();

    render(<ProductSearchPanel ref={panelRef} products={sampleProducts} onAddToCart={onAddToCart} />);

    const input = screen.getByPlaceholderText("Search products by name, SKU...");
    input.blur();

    act(() => {
      panelRef.current?.focusSearch();
    });

    expect(input).toHaveFocus();
  });
});
