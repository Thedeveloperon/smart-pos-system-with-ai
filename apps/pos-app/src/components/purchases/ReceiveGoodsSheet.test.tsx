import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReceiveGoodsSheet from "./ReceiveGoodsSheet";
import { fetchProducts } from "@/lib/api";
import { receivePurchaseOrder } from "@/lib/purchases";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  fetchProducts: vi.fn(),
}));

vi.mock("@/lib/purchases", async () => {
  const actual = await vi.importActual("@/lib/purchases");
  return {
    ...actual,
    receivePurchaseOrder: vi.fn(),
  };
});

describe("ReceiveGoodsSheet", () => {
  it("opens serial entry before submitting serial-tracked receipts and sends serials in the payload", async () => {
    vi.mocked(fetchProducts).mockResolvedValue([
      {
        id: "product-1",
        product_id: "product-1",
        name: "W15 Bulb",
        sku: "BULB-15",
        unitPrice: 0,
        costPrice: 0,
        stockQuantity: 0,
        reorderLevel: 0,
        alertLevel: 0,
        allowNegativeStock: false,
        isSerialTracked: true,
        is_serial_tracked: true,
        isActive: true,
        isLowStock: false,
        createdAt: "2026-05-03T00:00:00.000Z",
        created_at: "2026-05-03T00:00:00.000Z",
        unit_price: 0,
        cost_price: 0,
        stock_quantity: 0,
        reorder_level: 0,
        alert_level: 0,
        allow_negative_stock: false,
        is_active: true,
        is_low_stock: false,
      },
    ]);
    vi.mocked(receivePurchaseOrder).mockResolvedValue({
      id: "po-1",
      supplier_id: "supplier-1",
      supplier_name: "Orange Pvt Ltd",
      po_number: "PO-527717",
      po_date: "2026-05-03",
      expected_delivery_date: null,
      status: "Received",
      currency: "LKR",
      subtotal_estimate: 1800,
      notes: null,
      created_at: "2026-05-03T00:00:00.000Z",
      updated_at: "2026-05-03T00:00:00.000Z",
      bills: [],
      lines: [],
    });

    const onClose = vi.fn();
    const onReceived = vi.fn();

    render(
      <ReceiveGoodsSheet
        open
        po={{
          id: "po-1",
          supplier_id: "supplier-1",
          supplier_name: "Orange Pvt Ltd",
          po_number: "PO-527717",
          po_date: "2026-05-03",
          expected_delivery_date: null,
          status: "Sent",
          currency: "LKR",
          subtotal_estimate: 1800,
          notes: null,
          created_at: "2026-05-03T00:00:00.000Z",
          updated_at: null,
          bills: [],
          lines: [
            {
              id: "line-1",
              product_id: "product-1",
              product_name: "W15 Bulb",
              quantity_ordered: 20,
              quantity_received: 0,
              quantity_pending: 2,
              unit_cost_estimate: 90,
            },
          ],
        }}
        onClose={onClose}
        onReceived={onReceived}
      />,
    );

    await screen.findByRole("button", { name: "Add serials" });

    fireEvent.change(screen.getByPlaceholderText("INV-..."), { target: { value: "INV-1001" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Receipt & Update Stock" }));

    expect(receivePurchaseOrder).not.toHaveBeenCalled();
    expect(await screen.findByText("Add serial numbers")).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText("Paste serial numbers (one per line or comma-separated)"),
      { target: { value: "SN0001\nSN0002" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save serials" }));

    await waitFor(() => {
      expect(receivePurchaseOrder).toHaveBeenCalledTimes(1);
    });

    expect(receivePurchaseOrder).toHaveBeenCalledWith(
      "po-1",
      expect.objectContaining({
        invoice_number: "INV-1001",
        lines: [
          expect.objectContaining({
            product_id: "product-1",
            quantity_received: 2,
            serials: ["SN0001", "SN0002"],
          }),
        ],
      }),
    );
    expect(onReceived).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
