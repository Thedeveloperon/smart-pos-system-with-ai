import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PurchaseOrdersTab from "./PurchaseOrdersTab";
import { fetchSuppliers } from "@/lib/api";
import {
  fetchPurchaseOrders,
  reversePurchaseOrder,
} from "@/lib/purchases";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  fetchSuppliers: vi.fn(),
}));

vi.mock("@/lib/purchases", () => ({
  fetchPurchaseOrders: vi.fn(),
  sendPurchaseOrder: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
  reversePurchaseOrder: vi.fn(),
}));

describe("PurchaseOrdersTab", () => {
  it("shows a reverse action for received orders and calls the reverse endpoint after confirmation", async () => {
    vi.mocked(fetchSuppliers).mockResolvedValue([]);
    vi.mocked(fetchPurchaseOrders)
      .mockResolvedValueOnce([
        {
          id: "po-1",
          supplier_id: "supplier-1",
          supplier_name: "Planet",
          po_number: "PO-310987",
          po_date: "2026-05-02T00:00:00.000Z",
          expected_delivery_date: null,
          status: "Received",
          currency: "LKR",
          subtotal_estimate: 1638.6,
          notes: null,
          created_at: "2026-05-02T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
          lines: [],
          bills: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "po-1",
          supplier_id: "supplier-1",
          supplier_name: "Planet",
          po_number: "PO-310987",
          po_date: "2026-05-02T00:00:00.000Z",
          expected_delivery_date: null,
          status: "Sent",
          currency: "LKR",
          subtotal_estimate: 1638.6,
          notes: null,
          created_at: "2026-05-02T00:00:00.000Z",
          updated_at: "2026-05-04T00:00:00.000Z",
          lines: [],
          bills: [],
        },
      ]);
    vi.mocked(reversePurchaseOrder).mockResolvedValue({
      id: "po-1",
      supplier_id: "supplier-1",
      supplier_name: "Planet",
      po_number: "PO-310987",
      po_date: "2026-05-02T00:00:00.000Z",
      expected_delivery_date: null,
      status: "Sent",
      currency: "LKR",
      subtotal_estimate: 1638.6,
      notes: null,
      created_at: "2026-05-02T00:00:00.000Z",
      updated_at: "2026-05-04T00:00:00.000Z",
      lines: [],
      bills: [],
    });

    render(<PurchaseOrdersTab />);

    expect(await screen.findByText("PO-310987")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
    expect(await screen.findByText("Reverse purchase order?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reverse PO" }));

    await waitFor(() => {
      expect(reversePurchaseOrder).toHaveBeenCalledWith("po-1");
    });
    await waitFor(() => {
      expect(fetchPurchaseOrders).toHaveBeenCalledTimes(2);
    });
    expect(toast.success).toHaveBeenCalledWith("PO PO-310987 reversed.");
  });
});
