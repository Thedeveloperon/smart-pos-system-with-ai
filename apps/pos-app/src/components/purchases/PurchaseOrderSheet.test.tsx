import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PurchaseOrderSheet, { getDefaultUnitCostEstimate } from "./PurchaseOrderSheet";
import { fetchProducts, fetchSuppliers } from "@/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  fetchProducts: vi.fn(),
  fetchSuppliers: vi.fn(),
}));

vi.mock("@/lib/purchases", () => ({
  createPurchaseOrder: vi.fn(),
  updatePurchaseOrder: vi.fn(),
}));

describe("getDefaultUnitCostEstimate", () => {
  it("prefers product cost price over selling price when defaulting PO unit cost", () => {
    expect(
      getDefaultUnitCostEstimate({
        cost_price: 3594.456,
        costPrice: 3594.456,
        unit_price: 4999,
        price: 4999,
      }),
    ).toBe(3594.46);
  });

  it("falls back safely when cost price is unavailable", () => {
    expect(getDefaultUnitCostEstimate({ unit_price: 1200, price: 999 })).toBe(1200);
    expect(getDefaultUnitCostEstimate(undefined)).toBe(0);
  });
});

describe("PurchaseOrderSheet validation", () => {
  beforeEach(() => {
    vi.mocked(fetchSuppliers).mockResolvedValue([]);
    vi.mocked(fetchProducts).mockResolvedValue([]);
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it("highlights required fields and clears PO number error after editing", async () => {
    render(
      <PurchaseOrderSheet
        open
        mode="create"
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(fetchSuppliers).toHaveBeenCalled();
      expect(fetchProducts).toHaveBeenCalled();
    });

    const poInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(poInput, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    expect(toast.error).toHaveBeenCalledWith("Supplier, PO number, and at least one line are required.");
    expect(poInput.className).toContain("border-red-500");
    expect(screen.getByText("At least one line item is required.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("data-invalid", "true");

    fireEvent.change(poInput, { target: { value: "PO-NEW-001" } });
    expect(poInput.className).not.toContain("border-red-500");
  });
});
