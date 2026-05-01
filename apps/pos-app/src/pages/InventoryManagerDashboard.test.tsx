import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InventoryManagerDashboard from "./InventoryManagerDashboard";

const fetchProductsMock = vi.fn();
const fetchInventoryDashboardSummaryMock = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchProducts: (...args: unknown[]) => fetchProductsMock(...args),
  fetchInventoryDashboardSummary: (...args: unknown[]) => fetchInventoryDashboardSummaryMock(...args),
}));

describe("InventoryManagerDashboard", () => {
  beforeEach(() => {
    fetchProductsMock.mockReset();
    fetchInventoryDashboardSummaryMock.mockReset();

    fetchProductsMock.mockResolvedValue([
      {
        id: "p-1",
        name: "Milk Packet",
        sku: "MILK-001",
        price: 320,
        stock: 12,
      },
      {
        id: "p-2",
        name: "Tea Powder",
        sku: "TEA-001",
        price: 850,
        stock: 4,
        isLowStock: true,
      },
    ]);
    fetchInventoryDashboardSummaryMock.mockResolvedValue({
      expiry_alert_count: 1,
      open_warranty_claims: 2,
    });

    window.history.replaceState({}, "", "/inventory-manager?returnTo=%2F");
  });

  it("renders the expected dashboard sections and lets users add products to the current sale", async () => {
    render(<InventoryManagerDashboard />);

    expect(await screen.findByRole("button", { name: /Inventory/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Products/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Purchases/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reports/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manager/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Inventory" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Current sale" })).toBeInTheDocument();
    expect(screen.getByText("Tap a product to add it.")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Milk Packet/i }));

    await waitFor(() => {
      expect(screen.queryByText("Tap a product to add it.")).not.toBeInTheDocument();
    });

    const currentSale = within(screen.getByTestId("current-sale-panel"));
    expect(currentSale.getByText("Milk Packet")).toBeInTheDocument();
    expect(currentSale.getByText("Rs. 320.00 x 1")).toBeInTheDocument();
    expect(currentSale.getAllByText("Rs. 320.00")).toHaveLength(2);
  });
});
