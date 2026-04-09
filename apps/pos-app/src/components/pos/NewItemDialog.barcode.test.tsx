import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewItemDialog from "./NewItemDialog";
import {
  createProduct,
  fetchBrands,
  fetchCategories,
  fetchProductCatalogItems,
  fetchSuppliers,
  generateProductBarcode,
  validateProductBarcode,
} from "@/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    createProduct: vi.fn(),
    fetchBrands: vi.fn(),
    fetchCategories: vi.fn(),
    fetchProductCatalogItems: vi.fn(),
    fetchSuppliers: vi.fn(),
    generateProductBarcode: vi.fn(),
    validateProductBarcode: vi.fn(),
  };
});

function renderDialog() {
  render(
    <NewItemDialog
      open={true}
      onOpenChange={vi.fn()}
    />,
  );
}

describe("NewItemDialog barcode flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchBrands).mockResolvedValue([]);
    vi.mocked(fetchCategories).mockResolvedValue([]);
    vi.mocked(fetchProductCatalogItems).mockResolvedValue([]);
    vi.mocked(fetchSuppliers).mockResolvedValue([]);
  });

  it("generates barcode and shows success message", async () => {
    vi.mocked(generateProductBarcode).mockResolvedValue({
      barcode: "4006381333931",
      format: "ean-13",
      generated_at: "2026-04-03T00:00:00Z",
    });

    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: "Gen" }));

    await waitFor(() => {
      expect(generateProductBarcode).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByLabelText("Barcode")).toHaveValue("4006381333931");
    expect(screen.getByText("Generated EAN-13 barcode is ready.")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Barcode generated.");
  });

  it("shows invalid, duplicate, and valid inline validation states", async () => {
    vi.mocked(validateProductBarcode)
      .mockResolvedValueOnce({
        barcode: "123",
        normalized_barcode: "123",
        is_valid: false,
        format: "numeric-custom",
        message: "Barcode format is invalid.",
        exists: false,
      })
      .mockResolvedValueOnce({
        barcode: "4006381333931",
        normalized_barcode: "4006381333931",
        is_valid: true,
        format: "ean-13",
        message: null,
        exists: true,
      })
      .mockResolvedValueOnce({
        barcode: "5901234123457",
        normalized_barcode: "5901234123457",
        is_valid: true,
        format: "ean-13",
        message: null,
        exists: false,
      });

    renderDialog();

    const barcodeInput = await screen.findByLabelText("Barcode");

    fireEvent.change(barcodeInput, { target: { value: "123" } });
    fireEvent.blur(barcodeInput);
    expect(await screen.findByText("Barcode format is invalid.")).toBeInTheDocument();

    fireEvent.change(barcodeInput, { target: { value: "4006381333931" } });
    fireEvent.blur(barcodeInput);
    expect(await screen.findByText("Barcode already exists in another product.")).toBeInTheDocument();

    fireEvent.change(barcodeInput, { target: { value: "5901234123457" } });
    fireEvent.blur(barcodeInput);
    expect(await screen.findByText("Barcode is valid (ean-13).")).toBeInTheDocument();

    expect(validateProductBarcode).toHaveBeenCalledTimes(3);
  });

  it("creates a product with the POS Manager stock fields", async () => {
    vi.mocked(createProduct).mockResolvedValue({
      id: "product-1",
      name: "Test Item",
      sku: "SKU-1",
      barcode: null,
      image: null,
      imageUrl: null,
      categoryId: null,
      categoryName: null,
      brandId: null,
      brandName: null,
      unitPrice: 25,
      costPrice: 15,
      stockQuantity: 0,
      reorderLevel: 5,
      alertLevel: 5,
      allowNegativeStock: true,
      safetyStock: 0,
      targetStockLevel: 0,
      isActive: true,
      isLowStock: false,
      createdAt: "2026-04-03T00:00:00Z",
      updatedAt: null,
    } as never);

    renderDialog();

    fireEvent.change(await screen.findByLabelText("Item name"), {
      target: { value: "Test Item" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Item" }));

    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledTimes(1);
    });

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test Item",
        brand_id: null,
        safety_stock: 0,
        target_stock_level: 0,
      }),
    );
  });
});
