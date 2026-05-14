import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CatalogueTab from "./CatalogueTab";
import {
  fetchBrands,
  fetchCategories,
  fetchProductCatalogItems,
  updateProduct,
  type Brand,
  type Product,
} from "@/lib/api";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: unknown }) => <div>{children}</div>,
  TabsList: ({ children }: { children: unknown }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: unknown }) => <button type="button">{children}</button>,
  TabsContent: ({ children }: { children: unknown }) => <div>{children}</div>,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    createBrand: vi.fn(),
    createCategory: vi.fn(),
    fetchBrands: vi.fn(),
    fetchCategories: vi.fn(),
    fetchProductCatalogItems: vi.fn(),
    hardDeleteBrand: vi.fn(),
    hardDeleteCategory: vi.fn(),
    updateBrand: vi.fn(),
    updateCategory: vi.fn(),
    updateProduct: vi.fn(),
  };
});

const brand = {
  id: "brand-1",
  brand_id: "brand-1",
  name: "Brand A",
  code: "BA",
  description: "Brand A description",
  isActive: true,
  is_active: true,
  productCount: 1,
  product_count: 1,
  can_delete: false,
  delete_block_reason: "Brand is linked to active products.",
  createdAt: "2026-05-03T00:00:00.000Z",
  created_at: "2026-05-03T00:00:00.000Z",
  updatedAt: null,
  updated_at: null,
} as Brand;

const product = {
  id: "product-1",
  product_id: "product-1",
  name: "Pencil",
  sku: "SKU-1",
  barcode: "1234567890123",
  image: undefined,
  imageUrl: null,
  image_url: null,
  categoryId: null,
  category_id: null,
  categoryName: null,
  category_name: null,
  brandId: "brand-1",
  brand_id: "brand-1",
  brandName: "Brand A",
  brand_name: "Brand A",
  price: 10,
  unitPrice: 10,
  unit_price: 10,
  costPrice: 7,
  cost_price: 7,
  stockQuantity: 50,
  stock_quantity: 50,
  initialStockQuantity: 50,
  initial_stock_quantity: 50,
  reorderLevel: 2,
  reorder_level: 2,
  alertLevel: 5,
  alert_level: 5,
  allowNegativeStock: false,
  allow_negative_stock: false,
  isSerialTracked: false,
  is_serial_tracked: false,
  warrantyMonths: 0,
  warranty_months: 0,
  isBatchTracked: false,
  is_batch_tracked: false,
  expiryAlertDays: 30,
  expiry_alert_days: 30,
  safetyStock: 0,
  safety_stock: 0,
  targetStockLevel: 2,
  target_stock_level: 2,
  isActive: true,
  is_active: true,
  isLowStock: false,
  is_low_stock: false,
  createdAt: "2026-05-03T00:00:00.000Z",
  created_at: "2026-05-03T00:00:00.000Z",
  updatedAt: null,
  updated_at: null,
  product_suppliers: [],
} as Product;

describe("CatalogueTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCategories).mockResolvedValue([]);
    vi.mocked(fetchBrands).mockResolvedValue([brand]);
    vi.mocked(fetchProductCatalogItems).mockResolvedValue([product]);
    vi.mocked(updateProduct).mockResolvedValue({ ...product, isActive: false, is_active: false });
  });

  it("shows linked brand products and allows toggling a single product", async () => {
    render(<CatalogueTab />);

    await waitFor(() => {
      expect(fetchProductCatalogItems).toHaveBeenCalledWith(200, true);
    });

    expect(await screen.findByText("Pencil")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deactivate Pencil" }));

    await waitFor(() => {
      expect(updateProduct).toHaveBeenCalledWith(
        "product-1",
        expect.objectContaining({
          name: "Pencil",
          brand_id: "brand-1",
          unit_price: 10,
          cost_price: 7,
          is_active: false,
        }),
      );
    });
  });
});
