import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import ProductSearchPanel from "./ProductSearchPanel";
import type { Product } from "./types";

const products: Product[] = [
  {
    id: "1",
    name: "Ball Pen",
    sku: "SKU-001",
    barcode: "BAR-111",
    price: 100,
    stock: 0,
    category: "Stationery",
    categoryName: "Stationery",
    brandName: "Atlas",
    isLowStock: true,
  },
  {
    id: "2",
    name: "Notebook",
    sku: "SKU-002",
    barcode: "BAR-222",
    price: 250,
    stock: 5,
    category: "Stationery",
    categoryName: "Stationery",
    brandName: "Atlas",
    isLowStock: false,
  },
  {
    id: "3",
    name: "Milk Powder",
    sku: "SKU-003",
    barcode: "BAR-333",
    price: 450,
    stock: 20,
    category: "Grocery",
    categoryName: "Grocery",
    brandName: "Anchor",
    isLowStock: false,
  },
];

const openSelectAndChoose = async (index: number, optionLabel: string) => {
  const trigger = screen.getAllByRole("combobox")[index];
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.mouseDown(trigger);
  }

  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }

  fireEvent.click(await screen.findByRole("option", { name: optionLabel }));
};

describe("ProductSearchPanel", () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  it("filters by stock and brand, then clears filters back to default", async () => {
    render(<ProductSearchPanel products={products} onAddToCart={vi.fn()} />);

    expect(screen.getByText("3 products")).toBeInTheDocument();

    await openSelectAndChoose(1, "Atlas");
    await waitFor(() => {
      expect(screen.getByText("2 products")).toBeInTheDocument();
    });

    await openSelectAndChoose(2, "Out of stock");
    await waitFor(() => {
      expect(screen.getByText("1 products")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Search products by name, SKU..."), {
      target: { value: "ball" },
    });
    await waitFor(() => {
      expect(screen.getByText("1 products")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(screen.getByText("3 products")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search products by name, SKU...")).toHaveValue("");
    });
  });

  it("supports exact product filter from the searchable product picker", async () => {
    render(<ProductSearchPanel products={products} onAddToCart={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "All products" }));
    fireEvent.change(screen.getByPlaceholderText("Search product..."), { target: { value: "Milk Powder" } });
    const matches = await screen.findAllByText("Milk Powder");
    fireEvent.click(matches[matches.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("1 products")).toBeInTheDocument();
    });
  });
});
