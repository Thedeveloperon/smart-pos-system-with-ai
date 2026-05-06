import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHeldBill } from "@/lib/api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("fetchHeldBill discount mapping", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("maps held-sale raw cashier line discount inputs into cart items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("/api/checkout/held/sale-1");

        return jsonResponse({
          sale_id: "sale-1",
          sale_number: "HLD-001",
          status: "held",
          subtotal: 500,
          discount_total: 25,
          transaction_discount_amount: 0,
          discount_percent: 0,
          tax_total: 0,
          grand_total: 475,
          paid_total: 0,
          change: 0,
          created_at: "2026-05-06T12:00:00Z",
          completed_at: null,
          custom_payout_used: false,
          cash_short_amount: 0,
          items: [
            {
              sale_item_id: "sale-item-1",
              product_id: "prod-1",
              product_name: "Rice 5kg",
              unit_price: 500,
              quantity: 1,
              cashier_line_discount_percent: 5,
              cashier_line_discount_fixed: null,
              catalog_discount_amount: 0,
              cashier_line_discount_amount: 25,
              discount_amount: 25,
              line_total: 475,
            },
          ],
          payments: [],
        });
      }),
    );

    const heldBill = await fetchHeldBill("sale-1");
    const [line] = heldBill.items;

    expect(line.cashierLineDiscountPercent).toBe(5);
    expect(line.cashierLineDiscountFixed).toBeNull();
    expect(line.cashierLineDiscountAmount).toBe(25);
    expect(line.discountAmount).toBe(25);
  });
});

