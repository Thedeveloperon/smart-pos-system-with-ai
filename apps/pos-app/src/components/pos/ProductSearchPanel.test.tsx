import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import ProductSearchPanel from "./ProductSearchPanel";
import type { Product } from "./types";

const lookupSerialMock = vi.fn();

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  lookupSerial: (...args: unknown[]) => lookupSerialMock(...args),
}));

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

  beforeEach(() => {
    lookupSerialMock.mockReset();
    lookupSerialMock.mockRejectedValue(new ApiError("Serial number not found.", 404));
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

    fireEvent.change(screen.getByPlaceholderText("Search products by name, SKU, serial..."), {
      target: { value: "ball" },
    });
    await waitFor(() => {
      expect(screen.getByText("1 products")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(screen.getByText("3 products")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search products by name, SKU, serial...")).toHaveValue("");
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

  it("adds an exact match only once for a single scan in expert mode", async () => {
    const onAddToCart = vi.fn();
    const exactMatchProducts: Product[] = [
      {
        id: "scan-1",
        name: "Scanner Item",
        sku: "SCAN-001",
        barcode: "1234567890128",
        price: 120,
        stock: 4,
        category: "Stationery",
        categoryName: "Stationery",
        brandName: "Atlas",
        isLowStock: false,
      },
    ];

    render(<ProductSearchPanel products={exactMatchProducts} onAddToCart={onAddToCart} expertMode />);

    const input = screen.getByPlaceholderText("Search products by name, SKU, serial...");
    fireEvent.change(input, { target: { value: "1234567890128" } });

    await waitFor(() => expect(onAddToCart).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("");
  });

  it("adds an available serial match in expert mode", async () => {
    const onAddToCart = vi.fn();
    lookupSerialMock.mockResolvedValue({
      serial_id: "serial-1",
      serial_value: "SERIAL-0001",
      product_id: "serial-product",
      product_name: "Serial Camera",
      status: "Available",
      product: {
        id: "serial-product",
        name: "Serial Camera",
        sku: "SER-CAM-1",
        price: 150000,
        stock: 1,
        barcode: "SER-CAM-BAR",
      },
    });

    render(<ProductSearchPanel products={products} onAddToCart={onAddToCart} expertMode />);

    fireEvent.change(screen.getByPlaceholderText("Search products by name, SKU, serial..."), {
      target: { value: "SERIAL-0001" },
    });

    await waitFor(() => {
      expect(onAddToCart).toHaveBeenCalledWith(
        expect.objectContaining({ id: "serial-product", name: "Serial Camera" }),
        1,
        { id: "serial-1", value: "SERIAL-0001" },
      );
    });
    expect(onAddToCart).toHaveBeenCalledTimes(1);
  });

  it("opens serial validation for serial-tracked products before adding them", async () => {
    const onAddToCart = vi.fn();
    lookupSerialMock.mockResolvedValue({
      serial_id: "serial-2",
      serial_value: "CAM-SN-002",
      product_id: "serial-product",
      product_name: "Serial Camera",
      status: "Available",
      product: {
        id: "serial-product",
        name: "Serial Camera",
        sku: "SER-CAM-1",
        price: 150000,
        stock: 3,
        barcode: "SER-CAM-BAR",
        is_serial_tracked: true,
      },
    });

    render(
      <ProductSearchPanel
        products={[
          {
            id: "serial-product",
            name: "Serial Camera",
            sku: "SER-CAM-1",
            barcode: "SER-CAM-BAR",
            price: 150000,
            stock: 3,
            is_serial_tracked: true,
          },
        ]}
        onAddToCart={onAddToCart}
        expertMode
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search products by name, SKU, serial..."), {
      target: { value: "Serial Camera" },
    });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(onAddToCart).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Serial number"), {
      target: { value: "CAM-SN-002" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    await waitFor(() => {
      expect(onAddToCart).toHaveBeenCalledWith(
        expect.objectContaining({ id: "serial-product", name: "Serial Camera" }),
        1,
        { id: "serial-2", value: "CAM-SN-002" },
      );
    });
  });
});
