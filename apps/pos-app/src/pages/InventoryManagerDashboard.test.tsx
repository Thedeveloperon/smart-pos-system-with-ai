import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InventoryManagerDashboard from "./InventoryManagerDashboard";

const fetchInventoryDashboardMock = vi.fn();
const fetchStockMovementsMock = vi.fn();
const fetchWarrantyClaimsMock = vi.fn();
const fetchProductsMock = vi.fn();
const fetchCategoriesMock = vi.fn();
const fetchBrandsMock = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchInventoryDashboard: (...args: unknown[]) => fetchInventoryDashboardMock(...args),
  fetchStockMovements: (...args: unknown[]) => fetchStockMovementsMock(...args),
  fetchWarrantyClaims: (...args: unknown[]) => fetchWarrantyClaimsMock(...args),
  fetchProducts: (...args: unknown[]) => fetchProductsMock(...args),
  fetchCategories: (...args: unknown[]) => fetchCategoriesMock(...args),
  fetchBrands: (...args: unknown[]) => fetchBrandsMock(...args),
}));

describe("InventoryManagerDashboard", () => {
  beforeEach(() => {
    fetchInventoryDashboardMock.mockReset();
    fetchStockMovementsMock.mockReset();
    fetchWarrantyClaimsMock.mockReset();
    fetchProductsMock.mockReset();
    fetchCategoriesMock.mockReset();
    fetchBrandsMock.mockReset();
    fetchInventoryDashboardMock.mockResolvedValue({
      expiry_alert_count: 2,
      open_warranty_claims: 1,
      low_stock_count: 0,
      open_stocktake_sessions: 0,
      expiry_alerts: [
        {
          batch_id: "b-1",
          product_name: "Rice",
          batch_number: "B-001",
          expiry_date: "2026-04-23T00:00:00.000Z",
          remaining_quantity: 12,
        },
      ],
    });
    fetchStockMovementsMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      take: 20,
    });
    fetchWarrantyClaimsMock.mockResolvedValue([]);
    fetchProductsMock.mockResolvedValue([
      {
        id: "p-1",
        name: "Rice",
        sku: "SKU-001",
        barcode: "BAR-001",
        price: 40,
        stock: 50,
        category: "Groceries",
        categoryName: "Groceries",
        brandName: "SXSZ",
        isLowStock: false,
      },
    ]);
    fetchCategoriesMock.mockResolvedValue([]);
    fetchBrandsMock.mockResolvedValue([]);

    window.history.replaceState({}, "", "/inventory-manager?returnTo=%2F");
  });

  it("keeps the inventory header fixed and switches tab content under it", async () => {
    render(<InventoryManagerDashboard />);

    expect(await screen.findByRole("button", { name: /Back to Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "POS Management" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Products" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Purchases" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Product Manager" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Current sale" })).not.toBeInTheDocument();
    expect(screen.getByText("Browse the current product list.")).toBeInTheDocument();
    expect(screen.getByText("Rice")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Inventory" }));
    fireEvent.click(screen.getByRole("tab", { name: "Inventory" }));
    expect(await screen.findByText("Low stock")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Inventory" })).toHaveAttribute("aria-selected", "true");
  });
});
