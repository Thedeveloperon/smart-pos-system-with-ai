import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductManagementDialog from "./ProductManagementDialog";
import {
  adjustStock,
  createProduct,
  fetchBrands,
  fetchCategories,
  fetchProductSuppliers,
  fetchSuppliers,
  updateProduct,
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
    adjustStock: vi.fn(),
    createProduct: vi.fn(),
    deleteProduct: vi.fn(),
    fetchBrands: vi.fn(),
    fetchCategories: vi.fn(),
    fetchProductBatches: vi.fn(),
    fetchProductSuppliers: vi.fn(),
    fetchSuppliers: vi.fn(),
    generateAndAssignProductBarcode: vi.fn(),
    generateProductBarcode: vi.fn(),
    hardDeleteProduct: vi.fn(),
    updateProduct: vi.fn(),
    validateProductBarcode: vi.fn(),
  };
});

const categories = [
  { category_id: "cat-1", name: "Cat A", description: "Category A" },
  { category_id: "cat-2", name: "Cat B", description: "Category B" },
];

const brands = [
  { brand_id: "brand-1", name: "Brand A", code: "BA" },
  { brand_id: "brand-2", name: "Brand B", code: "BB" },
];

const suppliers = [
  { supplier_id: "sup-1", name: "Supplier A" },
  { supplier_id: "sup-2", name: "Supplier B" },
];

const existingProduct = {
  id: "prod-101",
  name: "Existing Product",
  sku: "EX-101",
  barcode: "1234567890123",
  image_url: null,
  category_id: "cat-1",
  brand_id: "brand-1",
  unit_price: 150,
  cost_price: 120,
  price: 150,
  permanent_discount_percent: null,
  permanent_discount_fixed: null,
  stock_quantity: 5,
  stock: 5,
  initial_stock_quantity: 5,
  reorder_level: 2,
  safety_stock: 1,
  target_stock_level: 4,
  allow_negative_stock: false,
  is_serial_tracked: false,
  warranty_months: 0,
  is_batch_tracked: false,
  expiry_alert_days: 30,
  is_active: true,
  product_suppliers: [],
  created_at: "2026-05-03T00:00:00Z",
  updated_at: "2026-05-03T00:00:00Z",
};

function renderDialog(overrides: Partial<ComponentProps<typeof ProductManagementDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSaved = vi.fn();

  render(
    <ProductManagementDialog
      open={true}
      product={null}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      {...overrides}
    />,
  );

  return { onOpenChange, onSaved };
}

describe("ProductManagementDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCategories).mockResolvedValue(categories as never);
    vi.mocked(fetchBrands).mockResolvedValue(brands as never);
    vi.mocked(fetchSuppliers).mockResolvedValue(suppliers as never);
    vi.mocked(fetchProductSuppliers).mockResolvedValue([] as never);
  });

  it("blocks save when unit price is not a plain decimal value", async () => {
    renderDialog();

    fireEvent.change(await screen.findByLabelText("Product name"), {
      target: { value: "Test Product" },
    });
    fireEvent.change(screen.getByLabelText(/Unit price/i), {
      target: { value: "1e2" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Unit price is required and must be greater than 0.");
    });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("blocks save when cost price is not a plain decimal value", async () => {
    renderDialog();

    fireEvent.change(await screen.findByLabelText("Product name"), {
      target: { value: "Test Product" },
    });
    fireEvent.change(screen.getByLabelText(/Unit price/i), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText(/Cost price/i), {
      target: { value: "1e2" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Cost price must be a valid non-negative number.");
    });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("blocks save when cost price is greater than unit price", async () => {
    renderDialog();

    fireEvent.change(await screen.findByLabelText("Product name"), {
      target: { value: "Test Product" },
    });
    fireEvent.change(screen.getByLabelText(/Unit price/i), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/Cost price/i), {
      target: { value: "20" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Cost price cannot be greater than unit price.");
    });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("blocks saving an edited product when reorder level is not a plain decimal value", async () => {
    renderDialog({ product: existingProduct as never });

    fireEvent.change(await screen.findByLabelText("Reorder level"), {
      target: { value: "1e2" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Reorder level must be a valid non-negative number.");
    });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it("requires an entered reason before applying a stock adjustment", async () => {
    vi.mocked(adjustStock).mockResolvedValue({
      product_id: existingProduct.id,
      delta_quantity: 3,
      previous_quantity: 5,
      new_quantity: 8,
      reason: "cycle count correction",
      is_low_stock: false,
      alert_level: 2,
      safety_stock: 1,
      target_stock_level: 4,
    } as never);

    renderDialog({ product: existingProduct as never });

    fireEvent.click(await screen.findByRole("button", { name: "Adjust" }));

    const quantityInput = await screen.findByLabelText("Quantity change");
    const reasonInput = screen.getByLabelText("Reason");
    const applyButton = screen.getByRole("button", { name: "Apply adjustment" });

    expect((reasonInput as HTMLTextAreaElement).value).toBe("");
    expect(applyButton).toHaveAttribute("disabled");

    fireEvent.click(applyButton);
    expect(adjustStock).not.toHaveBeenCalled();

    fireEvent.change(quantityInput, { target: { value: "3" } });
    fireEvent.change(reasonInput, { target: { value: "  cycle count correction  " } });

    expect(applyButton).not.toHaveAttribute("disabled");

    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(adjustStock).toHaveBeenCalledWith(
        existingProduct.id,
        3,
        "cycle count correction",
        null,
      );
    });
  });
});
