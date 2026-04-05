import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TodaySalesDrawer from "./TodaySalesDrawer";
import { fetchDailySalesReport, fetchTransactionsReport } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchDailySalesReport: vi.fn(),
    fetchTransactionsReport: vi.fn(),
  };
});

describe("TodaySalesDrawer", () => {
  it("highlights custom payout sales in the transaction list", async () => {
    vi.mocked(fetchDailySalesReport).mockResolvedValue({
      from_date: "2026-04-05",
      to_date: "2026-04-05",
      sales_count: 1,
      refund_count: 0,
      gross_sales_total: 150,
      refunded_total: 0,
      net_sales_total: 150,
      items: [],
    });
    vi.mocked(fetchTransactionsReport).mockResolvedValue({
      from_date: "2026-04-05",
      to_date: "2026-04-05",
      take: 50,
      transaction_count: 1,
      gross_total: 150,
      reversed_total: 0,
      net_collected_total: 150,
      items: [
        {
          sale_id: "sale-1",
          sale_number: "SAL-001",
          status: "completed",
          timestamp: "2026-04-05T10:15:00Z",
          created_by_user_id: null,
          cashier_username: "cashier",
          cashier_full_name: "Cashier One",
          items_count: 1,
          grand_total: 150,
          paid_total: 200,
          reversed_total: 0,
          net_collected: 200,
          custom_payout_used: true,
          cash_short_amount: 1555,
          payment_breakdown: [
            {
              method: "cash",
              paid_amount: 200,
              reversed_amount: 0,
              net_amount: 200,
            },
          ],
        },
      ],
    });

    const { container } = render(
      <TooltipProvider delayDuration={0}>
        <TodaySalesDrawer
          open={true}
          onClose={vi.fn()}
          session={null}
          cashSalesTotal={150}
        />
      </TooltipProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Cash short +Rs. 1,555")).toBeInTheDocument();
    });

    const saleRow = screen.getByTestId("cash-short-sale-sale-1");
    expect(saleRow?.className).toContain("bg-red-50");
    expect(screen.getByText("Cash short +Rs. 1,555")).toBeInTheDocument();

    expect(screen.getByText("Cash short +Rs. 1,555")).toHaveAttribute("title", "Custom payout override");
  });

  it("does not derive cash short from paid and grand total when the stored amount is missing", async () => {
    vi.mocked(fetchDailySalesReport).mockResolvedValue({
      from_date: "2026-04-05",
      to_date: "2026-04-05",
      sales_count: 1,
      refund_count: 0,
      gross_sales_total: 180,
      refunded_total: 0,
      net_sales_total: 180,
      items: [],
    });
    vi.mocked(fetchTransactionsReport).mockResolvedValue({
      from_date: "2026-04-05",
      to_date: "2026-04-05",
      take: 50,
      transaction_count: 1,
      gross_total: 180,
      reversed_total: 0,
      net_collected_total: 180,
      items: [
        {
          sale_id: "sale-2",
          sale_number: "SAL-002",
          status: "completed",
          timestamp: "2026-04-05T10:15:00Z",
          created_by_user_id: null,
          cashier_username: "cashier",
          cashier_full_name: "Cashier One",
          items_count: 1,
          grand_total: 180,
          paid_total: 1000,
          reversed_total: 0,
          net_collected: 1000,
          custom_payout_used: true,
          cash_short_amount: 0,
          payment_breakdown: [
            {
              method: "cash",
              paid_amount: 1000,
              reversed_amount: 0,
              net_amount: 1000,
            },
          ],
        },
      ],
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TodaySalesDrawer
          open={true}
          onClose={vi.fn()}
          session={null}
          cashSalesTotal={180}
        />
      </TooltipProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Cash short Rs. 0")).toBeInTheDocument();
    });
  });
});
