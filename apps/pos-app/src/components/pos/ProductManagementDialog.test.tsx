import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductManagementDialog from "./ProductManagementDialog";
import {
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

function renderDialog(overrides: Partial<ComponentProps<typeof ProductManagementDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSaved = vi.fn();
  const onNavigate = vi.fn();

  render(
    <ProductManagementDialog
      open={true}
      product={null}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      onNavigate={onNavigate}
      {...overrides}
    />,
  );

  return { onOpenChange, onSaved, onNavigate };
}

async function openSelect(index: number) {
  const trigger = screen.getAllByRole("combobox")[index];
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
}

describe("ProductManagementDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(fetchCategories).mockResolvedValue(categories as never);
    vi.mocked(fetchBrands).mockResolvedValue(brands as never);
    vi.mocked(fetchSuppliers).mockResolvedValue(suppliers as never);
    vi.mocked(fetchProductSuppliers).mockResolvedValue([] as never);
  });

  it("loads saved defaults for a new product", async () => {
    window.localStorage.setItem(
      "pos_product_form_defaults",
      JSON.stringify({
        categoryId: "cat-2",
        brandId: "brand-1",
        preferredSupplierId: "sup-2",
      }),
    );

    renderDialog();

    await waitFor(() => {
      expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("Cat B");
      expect(screen.getAllByRole("combobox")[1]).toHaveTextContent("Brand A");
      expect(screen.getAllByRole("combobox")[2]).toHaveTextContent("Supplier B");
    });
  });

  it("blocks save when unit price is zero", async () => {
    renderDialog();

    fireEvent.change(await screen.findByLabelText("Product name"), {
      target: { value: "Test Product" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Unit price is required and must be greater than 0.");
    });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("persists defaults after creating a product", async () => {
    vi.mocked(createProduct).mockResolvedValue({
      id: "prod-1",
      name: "Test Product",
      sku: null,
      barcode: null,
      imageUrl: null,
      categoryId: "cat-1",
      categoryName: "Cat A",
      brandId: "brand-2",
      brandName: "Brand B",
      unitPrice: 25,
      costPrice: 10,
      stockQuantity: 0,
      reorderLevel: 0,
      alertLevel: 0,
      allowNegativeStock: false,
      safetyStock: 0,
      targetStockLevel: 0,
      isActive: true,
      isLowStock: false,
      createdAt: "2026-05-03T00:00:00Z",
      updatedAt: "2026-05-03T00:00:00Z",
    } as never);

    renderDialog();

    fireEvent.change(await screen.findByLabelText("Product name"), {
      target: { value: "Test Product" },
    });
    fireEvent.change(screen.getByLabelText(/Unit price/i), {
      target: { value: "25" },
    });

    await openSelect(0);
    fireEvent.click(await screen.findByRole("option", { name: "Cat A" }));

    await openSelect(1);
    fireEvent.click(await screen.findByRole("option", { name: "Brand B" }));

    await openSelect(2);
    fireEvent.click(await screen.findByRole("option", { name: "Supplier A" }));

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledTimes(1);
    });

    expect(JSON.parse(window.localStorage.getItem("pos_product_form_defaults") ?? "{}")).toEqual({
      categoryId: "cat-1",
      brandId: "brand-2",
      preferredSupplierId: "sup-1",
    });
  });

  it("renders add-new links in manager mode and navigates from the dropdown", async () => {
    const { onOpenChange, onNavigate } = renderDialog();

    await openSelect(0);
    const addCategoryButton = await screen.findByRole("button", { name: "Add new category" });
    fireEvent.pointerDown(addCategoryButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onNavigate).toHaveBeenCalledWith("catalogue");
  });

  it("clears permanent discounts and saves null values", async () => {
    const existingProduct = {
      id: "prod-100",
      name: "Discounted Item",
      sku: "DISC-100",
      barcode: "1234567890123",
      image_url: null,
      category_id: "cat-1",
      brand_id: "brand-1",
      unit_price: 150,
      cost_price: 120,
      price: 150,
      permanent_discount_percent: 10,
      permanent_discount_fixed: null,
      stock_quantity: 5,
      stock: 5,
      initial_stock_quantity: 5,
      reorder_level: 0,
      safety_stock: 0,
      target_stock_level: 0,
      allow_negative_stock: false,
      has_pack_option: false,
      pack_size: 0,
      pack_price: null,
      pack_label: null,
      is_serial_tracked: false,
      warranty_months: 0,
      is_batch_tracked: false,
      expiry_alert_days: 30,
      is_active: true,
      product_suppliers: [],
      created_at: "2026-05-03T00:00:00Z",
      updated_at: "2026-05-03T00:00:00Z",
    };
    vi.mocked(updateProduct).mockResolvedValue(existingProduct as never);

    renderDialog({ product: existingProduct as never });

    fireEvent.click(await screen.findByRole("button", { name: "Remove discount" }));
    expect(screen.getByLabelText("Permanent discount %")).toHaveValue(null);
    expect(screen.getByLabelText("Permanent discount Rs.")).toHaveValue(null);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateProduct).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(updateProduct).mock.calls[0]?.[1]).toMatchObject({
      permanent_discount_percent: null,
      permanent_discount_fixed: null,
    });
  });
});
