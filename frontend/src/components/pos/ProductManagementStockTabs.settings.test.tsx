import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductSettingsTab } from "./ProductManagementStockTabs";
import {
  fetchProductCatalogItems,
  fetchShopStockSettings,
  updateShopStockSettings,
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
    fetchProductCatalogItems: vi.fn(),
    fetchShopStockSettings: vi.fn(),
    updateShopStockSettings: vi.fn(),
  };
});

describe("ProductSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProductCatalogItems).mockResolvedValue([]);
    vi.mocked(fetchShopStockSettings).mockResolvedValue({
      id: "settings-1",
      storeId: null,
      defaultLowStockThreshold: 5,
      thresholdMultiplier: 1,
      defaultSafetyStock: 0,
      defaultLeadTimeDays: 7,
      defaultTargetDaysOfCover: 14,
      createdAt: "2026-04-03T00:00:00Z",
      updatedAt: null,
    });
  });

  it("renders editable defaults and saves the updated values", async () => {
    vi.mocked(updateShopStockSettings).mockResolvedValue({
      id: "settings-1",
      storeId: null,
      defaultLowStockThreshold: 6,
      thresholdMultiplier: 1.5,
      defaultSafetyStock: 2,
      defaultLeadTimeDays: 4,
      defaultTargetDaysOfCover: 12,
      createdAt: "2026-04-03T00:00:00Z",
      updatedAt: "2026-04-04T00:00:00Z",
    });

    render(<ProductSettingsTab />);

    expect(await screen.findByDisplayValue("5")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Low Stock Threshold"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Threshold Multiplier"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Safety Stock"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Lead Time (days)"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Target Days of Cover"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Defaults" }));

    await waitFor(() => {
      expect(updateShopStockSettings).toHaveBeenCalledWith({
        defaultLowStockThreshold: 6,
        thresholdMultiplier: 1.5,
        defaultSafetyStock: 2,
        defaultLeadTimeDays: 4,
        defaultTargetDaysOfCover: 12,
      });
    });

    expect(toast.success).toHaveBeenCalledWith("Stock defaults saved.");
  });
});
