import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "./ReportsPage";
import {
  fetchDailySalesReport,
  fetchLowStockByBrandReport,
  fetchLowStockBySupplierReport,
  fetchLowStockReport,
  fetchMonthlySalesForecastReport,
  fetchPaymentBreakdownReport,
  fetchProducts,
  fetchTopItemsReport,
  fetchTransactionsReport,
  fetchWorstItemsReport,
} from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchProducts: vi.fn(),
    fetchDailySalesReport: vi.fn(),
    fetchTransactionsReport: vi.fn(),
    fetchPaymentBreakdownReport: vi.fn(),
    fetchTopItemsReport: vi.fn(),
    fetchWorstItemsReport: vi.fn(),
    fetchMonthlySalesForecastReport: vi.fn(),
    fetchLowStockReport: vi.fn(),
    fetchLowStockByBrandReport: vi.fn(),
    fetchLowStockBySupplierReport: vi.fn(),
  };
});

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.mocked(fetchProducts).mockResolvedValue([]);
    vi.mocked(fetchDailySalesReport).mockResolvedValue({
      from_date: "2026-04-24",
      to_date: "2026-04-30",
      sales_count: 0,
      refund_count: 0,
      gross_sales_total: 0,
      refunded_total: 0,
      net_sales_total: 0,
      items: [],
    });
    vi.mocked(fetchTransactionsReport).mockResolvedValue({
      from_date: "2026-04-24",
      to_date: "2026-04-30",
      take: 1000,
      transaction_count: 0,
      gross_total: 0,
      reversed_total: 0,
      net_collected_total: 0,
      items: [],
    });
    vi.mocked(fetchPaymentBreakdownReport).mockResolvedValue({
      from_date: "2026-04-24",
      to_date: "2026-04-30",
      paid_total: 0,
      reversed_total: 0,
      net_total: 0,
      items: [],
    });
    vi.mocked(fetchTopItemsReport).mockResolvedValue({
      from_date: "2026-04-24",
      to_date: "2026-04-30",
      take: 25,
      items: [],
    });
    vi.mocked(fetchWorstItemsReport).mockResolvedValue({
      from_date: "2026-04-24",
      to_date: "2026-04-30",
      take: 25,
      items: [],
    });
    vi.mocked(fetchMonthlySalesForecastReport).mockResolvedValue({
      generated_at: new Date().toISOString(),
      months: 6,
      average_monthly_net_sales: 0,
      trend_percent: 0,
      forecast_next_month_net_sales: 0,
      confidence: "low",
      items: [],
    });
    vi.mocked(fetchLowStockReport).mockResolvedValue({
      generated_at: new Date().toISOString(),
      threshold: 5,
      take: 100,
      items: [],
    });
    vi.mocked(fetchLowStockByBrandReport).mockResolvedValue({
      generated_at: new Date().toISOString(),
      threshold: 5,
      take: 20,
      items: [],
    });
    vi.mocked(fetchLowStockBySupplierReport).mockResolvedValue({
      generated_at: new Date().toISOString(),
      threshold: 5,
      take: 20,
      items: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("loads once on mount and does not auto refresh in the background", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    render(<ReportsPage onBack={vi.fn()} />);

    await waitFor(() => {
      expect(fetchProducts).toHaveBeenCalledTimes(1);
      expect(fetchDailySalesReport).toHaveBeenCalledTimes(1);
      expect(fetchTransactionsReport).toHaveBeenCalledTimes(1);
      expect(fetchPaymentBreakdownReport).toHaveBeenCalledTimes(1);
      expect(fetchTopItemsReport).toHaveBeenCalledTimes(1);
      expect(fetchWorstItemsReport).toHaveBeenCalledTimes(1);
      expect(fetchMonthlySalesForecastReport).toHaveBeenCalledTimes(1);
      expect(fetchLowStockReport).toHaveBeenCalledTimes(1);
      expect(fetchLowStockByBrandReport).toHaveBeenCalledTimes(1);
      expect(fetchLowStockBySupplierReport).toHaveBeenCalledTimes(1);
    });

    expect(fetchProducts).toHaveBeenCalledTimes(1);
    expect(fetchDailySalesReport).toHaveBeenCalledTimes(1);
    expect(fetchTransactionsReport).toHaveBeenCalledTimes(1);
    expect(fetchPaymentBreakdownReport).toHaveBeenCalledTimes(1);
    expect(fetchTopItemsReport).toHaveBeenCalledTimes(1);
    expect(fetchWorstItemsReport).toHaveBeenCalledTimes(1);
    expect(fetchMonthlySalesForecastReport).toHaveBeenCalledTimes(1);
    expect(fetchLowStockReport).toHaveBeenCalledTimes(1);
    expect(fetchLowStockByBrandReport).toHaveBeenCalledTimes(1);
    expect(fetchLowStockBySupplierReport).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
