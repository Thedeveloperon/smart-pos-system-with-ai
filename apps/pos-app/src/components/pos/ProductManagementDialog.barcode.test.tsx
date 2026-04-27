import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductManagementDialog from "./ProductManagementDialog";
import {
  deleteProduct,
  fetchBrands,
  fetchCategories,
  fetchProductCatalogItems,
  fetchProductSuppliers,
  fetchSuppliers,
  generateAndAssignProductBarcode,
  updateProduct,
  validateProductBarcode,
  type CatalogProduct,
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

vi.mock("./BarcodeLabelPrintDialog", () => ({
  default: () => null,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchBrands: vi.fn(),
    fetchProductCatalogItems: vi.fn(),
    fetchProductSuppliers: vi.fn(),
    fetchSuppliers: vi.fn(),
    fetchCategories: vi.fn(),
    generateAndAssignProductBarcode: vi.fn(),
    validateProductBarcode: vi.fn(),
    bulkGenerateMissingProductBarcodes: vi.fn(),
    deleteProduct: vi.fn(),
    hardDeleteProduct: vi.fn(),
    updateProduct: vi.fn(),
  };
});

const baseProduct: Omit<CatalogProduct, "barcode"> = {
  id: "prod-1",
  name: "Milk 1L",
  sku: "MILK-1L",
  image: undefined,
  imageUrl: null,
  categoryId: null,
  categoryName: null,
  unitPrice: 450,
  costPrice: 300,
  stockQuantity: 20,
  initialStockQuantity: 20,
  reorderLevel: 5,
  alertLevel: 5,
  allowNegativeStock: true,
  isActive: true,
  isLowStock: false,
  createdAt: "2026-04-03T00:00:00Z",
  updatedAt: "2026-04-03T00:00:00Z",
};

function renderDialog() {
  render(
    <ProductManagementDialog
      open={true}
      onOpenChange={vi.fn()}
      onChanged={vi.fn()}
    />,
  );
}

async function openEditorForFirstProduct() {
  expect(await screen.findByText("Milk 1L")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(await screen.findByText("POS Manager")).toBeInTheDocument();
}

describe("ProductManagementDialog barcode flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchBrands).mockResolvedValue([]);
    vi.mocked(fetchCategories).mockResolvedValue([]);
    vi.mocked(fetchProductSuppliers).mockResolvedValue([]);
    vi.mocked(fetchSuppliers).mockResolvedValue([]);
  });

  it("shows aligned summary cards with total, filtered, selected, and low-stock counts", async () => {
    const lowStockProduct: CatalogProduct = { ...baseProduct, id: "prod-2", name: "Soap", isLowStock: true, barcode: undefined };
    const healthyProduct: CatalogProduct = { ...baseProduct, id: "prod-3", name: "Rice", isLowStock: false, barcode: undefined };
    vi.mocked(fetchProductCatalogItems).mockResolvedValue([lowStockProduct, healthyProduct]);

    renderDialog();

    expect(await screen.findByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Filtered")).toBeInTheDocument();
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getAllByText("Low Stock").length).toBeGreaterThan(0);

    expect(screen.getByText("Soap")).toBeInTheDocument();
    expect(screen.getByText("Rice")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("generates barcode in editor and refreshes state", async () => {
    const productWithoutBarcode: CatalogProduct = { ...baseProduct, barcode: undefined };

    vi.mocked(fetchProductCatalogItems).mockResolvedValue([productWithoutBarcode]);
    vi.mocked(generateAndAssignProductBarcode).mockResolvedValue({
      ...productWithoutBarcode,
      barcode: "4006381333931",
    });

    renderDialog();
    await openEditorForFirstProduct();

    fireEvent.click(screen.getByRole("button", { name: "Gen" }));

    await waitFor(() => {
      expect(generateAndAssignProductBarcode).toHaveBeenCalledWith("prod-1", {
        force_replace: false,
        seed: "MILK-1L",
      });
    });
    expect(screen.getByText("Generated EAN-13 barcode is ready.")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Barcode generated.");
  });

  it("regenerates barcode and shows duplicate validation message", async () => {
    const productWithBarcode: CatalogProduct = { ...baseProduct, barcode: "4006381333931" };

    vi.mocked(fetchProductCatalogItems).mockResolvedValue([productWithBarcode]);
    vi.mocked(generateAndAssignProductBarcode).mockResolvedValue({
      ...productWithBarcode,
      barcode: "5901234123457",
    });
    vi.mocked(validateProductBarcode).mockResolvedValue({
      barcode: "4006381333931",
      normalized_barcode: "4006381333931",
      is_valid: true,
      format: "ean-13",
      message: null,
      exists: true,
    });

    renderDialog();
    await openEditorForFirstProduct();

    fireEvent.click(screen.getByRole("button", { name: "Reg" }));
    fireEvent.click(await screen.findByRole("button", { name: "Replace" }));

    await waitFor(() => {
      expect(generateAndAssignProductBarcode).toHaveBeenCalledWith("prod-1", {
        force_replace: true,
        seed: "MILK-1L",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Barcode regenerated.");

    const barcodeInput = screen.getByLabelText("Barcode");
    fireEvent.change(barcodeInput, { target: { value: "4006381333931" } });
    fireEvent.blur(barcodeInput);

    expect(await screen.findByText("Barcode already exists in another product.")).toBeInTheDocument();
    expect(validateProductBarcode).toHaveBeenCalledWith({
      barcode: "4006381333931",
      exclude_product_id: "prod-1",
      check_existing: true,
    });
  });

  it("bulk deletes selected products from the catalog", async () => {
    const product: CatalogProduct = { ...baseProduct, barcode: undefined };

    vi.mocked(fetchProductCatalogItems).mockResolvedValue([product]);
    vi.mocked(deleteProduct).mockResolvedValue(undefined);

    renderDialog();

    expect(await screen.findByText("Milk 1L")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Select Milk 1L"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Selected" }));

    await screen.findByText("Delete selected products?");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

    await waitFor(() => {
      expect(deleteProduct).toHaveBeenCalledWith("prod-1");
    });
    expect(toast.success).toHaveBeenCalledWith("Deleted 1 product.");
    await waitFor(() => {
      expect(screen.queryByText("Milk 1L")).not.toBeInTheDocument();
    });
  });

  it("saves product edits with the POS Manager stock fields", async () => {
    const product: CatalogProduct = { ...baseProduct, barcode: "4006381333931" };

    vi.mocked(fetchProductCatalogItems).mockResolvedValue([product]);
    vi.mocked(updateProduct).mockResolvedValue({
      ...product,
      unitPrice: 475,
      costPrice: 310,
      initialStockQuantity: 24,
      stockQuantity: 24,
      reorderLevel: 8,
      safetyStock: 2,
      targetStockLevel: 15,
    });

    renderDialog();
    await openEditorForFirstProduct();

    fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "475" } });
    fireEvent.change(screen.getByLabelText("Cost price"), { target: { value: "310" } });
    fireEvent.change(screen.getByLabelText("Initial stock"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Reorder level"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Safety stock"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Target stock"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateProduct).toHaveBeenCalledWith(
        "prod-1",
        expect.objectContaining({
          unit_price: 475,
          cost_price: 310,
          initial_stock_quantity: 24,
          reorder_level: 8,
          safety_stock: 2,
          target_stock_level: 15,
        }),
      );
    });
  });
});
