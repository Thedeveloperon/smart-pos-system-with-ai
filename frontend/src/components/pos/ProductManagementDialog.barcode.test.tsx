import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductManagementDialog from "./ProductManagementDialog";
import {
  deleteProduct,
  fetchCategories,
  fetchProductCatalogItems,
  generateAndAssignProductBarcode,
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
    fetchProductCatalogItems: vi.fn(),
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
  expect(await screen.findByText("Manage Product")).toBeInTheDocument();
}

describe("ProductManagementDialog barcode flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCategories).mockResolvedValue([]);
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

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

    await waitFor(() => {
      expect(generateAndAssignProductBarcode).toHaveBeenCalledWith("prod-1", {
        force_replace: true,
        seed: "MILK-1L",
      });
    });
    expect(confirmSpy).toHaveBeenCalled();
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
    confirmSpy.mockRestore();
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
});
