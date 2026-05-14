import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductsTab from "./ProductsTab";
import {
  fetchBrands,
  fetchCategories,
  fetchProductCatalogItems,
  fetchProducts,
  type Product,
} from "@/lib/api";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/pos/ProductManagementDialog", () => ({
  default: ({ open, product }: { open: boolean; product: Product | null }) =>
    open ? (
      <div
        data-testid="product-management-dialog"
        data-unit-price={String(product?.unit_price ?? "")}
        data-cost-price={String(product?.cost_price ?? "")}
      />
    ) : null,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    bulkGenerateMissingProductBarcodes: vi.fn(),
    deleteProduct: vi.fn(),
    fetchBrands: vi.fn(),
    fetchCategories: vi.fn(),
    fetchProductCatalogItems: vi.fn(),
    fetchProducts: vi.fn(),
    hardDeleteProduct: vi.fn(),
  };
});

const catalogProduct = {
  id: "product-1",
  product_id: "product-1",
  name: "Pencil",
  sku: "0168b051",
  barcode: "1234567890123",
  image_url: null,
  unitPrice: 10,
  unit_price: 10,
  costPrice: 7,
  cost_price: 7,
  stockQuantity: 50,
  stock_quantity: 50,
  initialStockQuantity: 50,
  initial_stock_quantity: 50,
  reorderLevel: 0,
  reorder_level: 0,
  alertLevel: 0,
  alert_level: 0,
  safetyStock: 0,
  safety_stock: 0,
  targetStockLevel: 0,
  target_stock_level: 0,
  allowNegativeStock: false,
  allow_negative_stock: false,
  isActive: true,
  is_active: true,
  isLowStock: false,
  is_low_stock: false,
  isSerialTracked: false,
  is_serial_tracked: false,
  warrantyMonths: null,
  warranty_months: null,
  isBatchTracked: false,
  is_batch_tracked: false,
  expiryAlertDays: null,
  expiry_alert_days: null,
  categoryId: null,
  category_id: null,
  categoryName: null,
  category_name: null,
  brandId: null,
  brand_id: null,
  brandName: null,
  brand_name: null,
  createdAt: "2026-05-03T00:00:00.000Z",
  created_at: "2026-05-03T00:00:00.000Z",
  updatedAt: null,
  updated_at: null,
  product_suppliers: [],
} as Product;

describe("ProductsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProductCatalogItems).mockResolvedValue([catalogProduct]);
    vi.mocked(fetchCategories).mockResolvedValue([]);
    vi.mocked(fetchBrands).mockResolvedValue([]);
  });

  it("loads catalog items for editing so cost price stays distinct from unit price", async () => {
    render(<ProductsTab />);

    await waitFor(() => {
      expect(fetchProductCatalogItems).toHaveBeenCalledTimes(1);
    });
    expect(fetchProducts).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));

    const dialog = await screen.findByTestId("product-management-dialog");
    expect(dialog).toHaveAttribute("data-unit-price", "10");
    expect(dialog).toHaveAttribute("data-cost-price", "7");
  });
});
