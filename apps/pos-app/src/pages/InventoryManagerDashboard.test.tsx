import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InventoryManagerDashboard from "./InventoryManagerDashboard";

const fetchInventoryDashboardMock = vi.fn();
const fetchStockMovementsMock = vi.fn();
const fetchWarrantyClaimsMock = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchInventoryDashboard: (...args: unknown[]) => fetchInventoryDashboardMock(...args),
  fetchStockMovements: (...args: unknown[]) => fetchStockMovementsMock(...args),
  fetchWarrantyClaims: (...args: unknown[]) => fetchWarrantyClaimsMock(...args),
}));

describe("InventoryManagerDashboard", () => {
  beforeEach(() => {
    fetchInventoryDashboardMock.mockReset();
    fetchStockMovementsMock.mockReset();
    fetchWarrantyClaimsMock.mockReset();
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

    window.history.replaceState({}, "", "/inventory-manager?returnTo=%2F");
  });

  it("keeps the inventory header fixed and switches tab content under it", async () => {
    render(<InventoryManagerDashboard />);

    expect(await screen.findByRole("button", { name: /Back to Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Inventory Management" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Movements" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Serials" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Batches" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Stocktake" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Claims" })).toBeInTheDocument();
    expect(await screen.findByText("Low stock")).toBeInTheDocument();
    expect(screen.getByText("Expiring batches (next 30 days)")).toBeInTheDocument();
    expect(await screen.findByText("Rice")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Movements" }));
    fireEvent.click(screen.getByRole("tab", { name: "Movements" }));
    expect(
      await screen.findByText("No movements match your filters."),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Movements" })).toHaveAttribute("aria-selected", "true");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Claims" }));
    fireEvent.click(screen.getByRole("tab", { name: "Claims" }));
    expect(
      await screen.findByText("No warranty claims found."),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Claims" })).toHaveAttribute("aria-selected", "true");
  });
});
