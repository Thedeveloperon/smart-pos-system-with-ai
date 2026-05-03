import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Package, RefreshCw, ShoppingCart, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  type Product,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { InventoryTab } from "./InventoryTab";
import { PaymentsTab } from "./PaymentsTab";
import { ProductsTab } from "./ProductsTab";
import { SalesTab } from "./SalesTab";
import { TransactionDetailDrawer, type ReportTransactionRow } from "./TransactionDetailDrawer";
import { TransactionsTab } from "./TransactionsTab";
import { fmtCurrency, fmtNum } from "./reportFormatters";

type Props = {
  onBack?: () => void;
  compact?: boolean;
};

type ReportTab = "sales" | "transactions" | "products" | "payments" | "inventory";
type DailySalesReport = Awaited<ReturnType<typeof fetchDailySalesReport>>;
type TransactionsReport = Awaited<ReturnType<typeof fetchTransactionsReport>>;
type PaymentsReport = Awaited<ReturnType<typeof fetchPaymentBreakdownReport>>;
type TopItemsReport = Awaited<ReturnType<typeof fetchTopItemsReport>>;
type WorstItemsReport = Awaited<ReturnType<typeof fetchWorstItemsReport>>;
type ForecastReport = Awaited<ReturnType<typeof fetchMonthlySalesForecastReport>>;
type LowStockReport = Awaited<ReturnType<typeof fetchLowStockReport>>;
type LowStockByBrand = Awaited<ReturnType<typeof fetchLowStockByBrandReport>>;
type LowStockBySupplier = Awaited<ReturnType<typeof fetchLowStockBySupplierReport>>;

type ProductPerformanceRow = {
  product_id: string;
  product_name: string;
  category: string;
  qty: number;
  net_sales: number;
  transactions?: number;
};

type ReportData = {
  products: Product[];
  summary: DailySalesReport;
  transactions: TransactionsReport;
  payments: PaymentsReport;
  topItems: TopItemsReport;
  worstItems: WorstItemsReport;
  forecast: ForecastReport;
  lowStock: LowStockReport;
  lowStockByBrand: LowStockByBrand;
  lowStockBySupplier: LowStockBySupplier;
};

const ALL_FILTER_VALUE = "__all__";
const UNCATEGORIZED_FILTER_VALUE = "__uncategorized__";
const TRANSACTION_TAKE = 1000;

const today = new Date();
const defaultToDate = formatDateInput(today);
const defaultFromDate = formatDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeLastUpdated(value: string | null) {
  if (!value) {
    return "Waiting for first refresh";
  }

  const updatedAt = new Date(value);
  const diffSeconds = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 1000));
  if (diffSeconds < 5) {
    return "Updated just now";
  }
  if (diffSeconds < 60) {
    return `Updated ${diffSeconds}s ago`;
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `Updated ${diffMinutes}m ago`;
  }

  return `Updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function normalizeCategoryFilterValue(categoryId?: string | null) {
  return categoryId ?? UNCATEGORIZED_FILTER_VALUE;
}

function resolveCategoryLabel(categoryName?: string | null) {
  return categoryName?.trim() || "Uncategorized";
}

function isSaleTransaction(transaction: ReportTransactionRow) {
  return (transaction.transaction_type ?? "sale") === "sale";
}

function buildProductPerformance(transactions: ReportTransactionRow[]) {
  const itemsByProduct = new Map<
    string,
    {
      category: string;
      netSales: number;
      productName: string;
      soldQuantity: number;
      transactionIds: Set<string>;
    }
  >();

  transactions.forEach((transaction) => {
    if (!isSaleTransaction(transaction)) {
      return;
    }

    transaction.line_items.forEach((lineItem) => {
      const existing = itemsByProduct.get(lineItem.product_id);
      if (existing) {
        existing.soldQuantity += lineItem.quantity;
        existing.netSales += lineItem.line_total;
        existing.transactionIds.add(transaction.sale_id);
        return;
      }

      itemsByProduct.set(lineItem.product_id, {
        category: resolveCategoryLabel(lineItem.category_name),
        netSales: lineItem.line_total,
        productName: lineItem.product_name,
        soldQuantity: lineItem.quantity,
        transactionIds: new Set([transaction.sale_id]),
      });
    });
  });

  return Array.from(itemsByProduct.entries()).map(([productId, value]) => ({
    product_id: productId,
    product_name: value.productName,
    category: value.category,
    qty: value.soldQuantity,
    net_sales: value.netSales,
    transactions: value.transactionIds.size,
  }));
}

function buildSummaryCard({
  icon,
  label,
  value,
  hint,
  active,
  onClick,
}: {
  icon: (props: { className?: string }) => JSX.Element;
  label: string;
  value: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = icon;

  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className={cn("h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md", active && "border-primary/50 ring-2 ring-primary/15")}>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="mt-1 truncate text-xl font-semibold">{value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary-soft/80">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

export default function ReportsPage({ onBack, compact = false }: Props) {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER_VALUE);
  const [productFilter, setProductFilter] = useState(ALL_FILTER_VALUE);
  const [activeTab, setActiveTab] = useState<ReportTab>("transactions");
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const requestSequenceRef = useRef(0);
  const hasInvalidDateRange = fromDate > toDate;

  const loadReports = useCallback(
    async (backgroundRefresh: boolean) => {
      const requestId = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestId;

      if (!reportData) {
        setIsLoading(true);
      } else if (!backgroundRefresh) {
        setIsRefreshing(true);
      }

      if (!backgroundRefresh) {
        setError(null);
      }

      try {
        const [products, summary, transactions, payments, topItems, worstItems, forecast, lowStock, lowStockByBrand, lowStockBySupplier] = await Promise.all([
          fetchProducts(),
          fetchDailySalesReport(fromDate, toDate),
          fetchTransactionsReport(fromDate, toDate, TRANSACTION_TAKE),
          fetchPaymentBreakdownReport(fromDate, toDate),
          fetchTopItemsReport(fromDate, toDate, 25),
          fetchWorstItemsReport(fromDate, toDate, 25),
          fetchMonthlySalesForecastReport(6),
          fetchLowStockReport(100),
          fetchLowStockByBrandReport(20),
          fetchLowStockBySupplierReport(20),
        ]);

        if (requestId !== requestSequenceRef.current) {
          return;
        }

        setReportData({
          products,
          summary,
          transactions,
          payments,
          topItems,
          worstItems,
          forecast,
          lowStock,
          lowStockByBrand,
          lowStockBySupplier,
        });
        setLastUpdatedAt(new Date().toISOString());
        setError(null);
      } catch (loadError) {
        if (requestId !== requestSequenceRef.current) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load reports.");
      } finally {
        if (requestId === requestSequenceRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [fromDate, reportData, toDate],
  );

  useEffect(() => {
    if (hasInvalidDateRange) {
      return;
    }

    void loadReports(false);
  }, [fromDate, hasInvalidDateRange, loadReports, toDate]);

  const products = reportData?.products ?? [];
  const categoryOptions = Array.from(
    new Map(
      products.map((product) => [
        normalizeCategoryFilterValue(product.category_id),
        resolveCategoryLabel(product.category_name),
      ]),
    ).entries(),
  )
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  const productOptions = products
    .filter((product) => {
      if (categoryFilter === ALL_FILTER_VALUE) {
        return true;
      }

      return normalizeCategoryFilterValue(product.category_id) === categoryFilter;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  useEffect(() => {
    if (productFilter === ALL_FILTER_VALUE) {
      return;
    }

    const selectedProductStillMatches = productOptions.some((product) => product.id === productFilter);
    if (!selectedProductStillMatches) {
      setProductFilter(ALL_FILTER_VALUE);
    }
  }, [productFilter, productOptions]);

  const allTransactions: ReportTransactionRow[] = reportData?.transactions.items ?? [];
  const filteredTransactions = allTransactions.filter((transaction) => {
    if (categoryFilter === ALL_FILTER_VALUE && productFilter === ALL_FILTER_VALUE) {
      return true;
    }

    if (!isSaleTransaction(transaction)) {
      return false;
    }

    const matchesCategory =
      categoryFilter === ALL_FILTER_VALUE ||
      transaction.line_items.some((lineItem) => normalizeCategoryFilterValue(lineItem.category_id) === categoryFilter);
    const matchesProduct =
      productFilter === ALL_FILTER_VALUE ||
      transaction.line_items.some((lineItem) => lineItem.product_id === productFilter);

    return matchesCategory && matchesProduct;
  });

  useEffect(() => {
    if (!selectedTransactionId) {
      return;
    }

    const transactionStillVisible = filteredTransactions.some((transaction) => transaction.sale_id === selectedTransactionId);
    if (!transactionStillVisible) {
      setSelectedTransactionId(null);
    }
  }, [filteredTransactions, selectedTransactionId]);

  const selectedTransaction =
    filteredTransactions.find((transaction) => transaction.sale_id === selectedTransactionId) ?? null;

  const summary = reportData?.summary;
  const topProduct = reportData?.topItems.items[0] ?? null;
  const selectedCategoryLabel = categoryOptions.find((option) => option.value === categoryFilter)?.label ?? "All categories";
  const selectedProductLabel = productOptions.find((product) => product.id === productFilter)?.name ?? "All products";

  const filteredSalesTransactions = filteredTransactions.filter(isSaleTransaction);
  const filteredRows = buildProductPerformance(filteredSalesTransactions);
  const sortedFilteredDesc = [...filteredRows]
    .sort((left, right) => (right.qty !== left.qty ? right.qty - left.qty : right.net_sales - left.net_sales))
    .slice(0, 25);
  const sortedFilteredAsc = [...filteredRows]
    .sort((left, right) => (left.qty !== right.qty ? left.qty - right.qty : left.net_sales - right.net_sales))
    .slice(0, 25);

  const topRows: ProductPerformanceRow[] =
    categoryFilter !== ALL_FILTER_VALUE || productFilter !== ALL_FILTER_VALUE
      ? sortedFilteredDesc
      : (reportData?.topItems.items ?? []).map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          category: resolveCategoryLabel(products.find((product) => product.id === item.product_id)?.category_name),
          qty: item.net_quantity,
          net_sales: item.net_sales,
          transactions: 0,
        }));

  const worstRows: ProductPerformanceRow[] =
    categoryFilter !== ALL_FILTER_VALUE || productFilter !== ALL_FILTER_VALUE
      ? sortedFilteredAsc
      : (reportData?.worstItems.items ?? []).map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          category: resolveCategoryLabel(products.find((product) => product.id === item.product_id)?.category_name),
          qty: item.net_quantity,
          net_sales: item.net_sales,
          transactions: 0,
        }));

  return (
    <div className={compact ? "space-y-4" : "min-h-screen pos-shell"}>
      {!compact ? (
        <header className="sticky top-0 z-50 border-b border-white/10 bg-pos-header text-pos-header-foreground shadow-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <div>
                <h1 className="font-semibold">Reports</h1>
                <p className="text-xs text-pos-header-foreground/70">Sales, transactions, products, payments, and inventory health.</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadReports(false)}
              disabled={isRefreshing || hasInvalidDateRange}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </header>
      ) : null}

      <main className={compact ? "space-y-4" : "mx-auto max-w-7xl space-y-4 px-4 py-6"}>
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base">Report Controls</CardTitle>
                <CardDescription>
                  Date range updates all report totals. Category and product filters refine transaction and product detail sections.
                </CardDescription>
              </div>
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                Date range controls all report snapshots
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="reports-from-date">From</Label>
                <Input id="reports-from-date" type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reports-to-date">To</Label>
                <Input id="reports-to-date" type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Category detail filter</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>All categories</SelectItem>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Product detail filter</Label>
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>All products</SelectItem>
                    {productOptions.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2 self-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFromDate(defaultFromDate);
                    setToDate(defaultToDate);
                    setCategoryFilter(ALL_FILTER_VALUE);
                    setProductFilter(ALL_FILTER_VALUE);
                  }}
                >
                  Reset filters
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void loadReports(false)}
                  disabled={isRefreshing || hasInvalidDateRange}
                >
                  Refresh data
                </Button>
              </div>
            </div>

            {hasInvalidDateRange ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                The start date must be on or before the end date.
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {formatShortDate(fromDate)} to {formatShortDate(toDate)}
              </Badge>
              <Badge variant="outline">{selectedCategoryLabel}</Badge>
              <Badge variant="outline">{selectedProductLabel}</Badge>
              <span>{formatRelativeLastUpdated(lastUpdatedAt)}</span>
            </div>

            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {isLoading && !reportData ? (
          <ReportsSkeleton />
        ) : summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {buildSummaryCard({
                icon: TrendingUp,
                label: "Net Sales",
                value: fmtCurrency(summary.net_sales_total),
                hint: `${fmtNum(summary.refund_count)} refunds in selected range`,
                active: activeTab === "sales",
                onClick: () => setActiveTab("sales"),
              })}
              {buildSummaryCard({
                icon: ShoppingCart,
                label: "Transactions",
                value: fmtNum(summary.sales_count),
                hint: summary.sales_count > 0 ? `Avg ${fmtCurrency(summary.gross_sales_total / summary.sales_count)} per sale` : "No completed sales",
                active: activeTab === "transactions",
                onClick: () => setActiveTab("transactions"),
              })}
              {buildSummaryCard({
                icon: Package,
                label: "Top Product",
                value: topProduct?.product_name || "No sales yet",
                hint: topProduct ? `${fmtNum(topProduct.net_quantity)} sold` : "No ranking available",
                active: activeTab === "products",
                onClick: () => setActiveTab("products"),
              })}
              {buildSummaryCard({
                icon: Package,
                label: "Items Sold",
                value: fmtNum(summary.items_sold_total),
                hint: `Across ${fmtNum(summary.sales_count)} completed sales`,
                active: activeTab === "products",
                onClick: () => setActiveTab("products"),
              })}
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="sales">Sales</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="products">Products</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="inventory">Inventory</TabsTrigger>
              </TabsList>

              <TabsContent value="sales" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Daily Sales Summary</CardTitle>
                    <CardDescription>Day-by-day net sales, refund activity, and item volumes for the selected date range.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SalesTab rows={summary.items} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="transactions" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Transaction Ledger</CardTitle>
                    <CardDescription>Click any row to inspect line items, payment mix, cashier details, and cash drawer movements.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TransactionsTab
                      rows={filteredTransactions}
                      totalCount={reportData.transactions.transaction_count}
                      onSelect={setSelectedTransactionId}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="products" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Product Performance</CardTitle>
                    <CardDescription>Ranked products for the selected date range. Category and product filters apply here directly.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{categoryFilter === ALL_FILTER_VALUE ? "All categories" : selectedCategoryLabel}</Badge>
                      <Badge variant="outline">{productFilter === ALL_FILTER_VALUE ? "All products" : selectedProductLabel}</Badge>
                      {categoryFilter !== ALL_FILTER_VALUE || productFilter !== ALL_FILTER_VALUE ? (
                        <span>Filtered ranking is generated from the loaded transaction set.</span>
                      ) : null}
                    </div>
                    <ProductsTab top={topRows} worst={worstRows} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Payment Breakdown</CardTitle>
                    <CardDescription>Payment totals stay scoped to the selected date range. Product and category filters do not alter this section.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PaymentsTab rows={reportData.payments.items} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="inventory" className="mt-4">
                <InventoryTab
                  generatedAt={reportData.lowStock.generated_at}
                  lowStock={reportData.lowStock.items}
                  byBrand={reportData.lowStockByBrand.items.map((row) => ({
                    name: row.brand_name ?? "Unbranded",
                    low_stock_count: row.low_stock_count,
                    total_deficit: row.total_deficit,
                    estimated_reorder_value: row.estimated_reorder_value,
                  }))}
                  bySupplier={reportData.lowStockBySupplier.items.map((row) => ({
                    name: row.supplier_name ?? "No supplier",
                    low_stock_count: row.low_stock_count,
                    total_deficit: row.total_deficit,
                    estimated_reorder_value: row.estimated_reorder_value,
                  }))}
                />
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </main>

      <TransactionDetailDrawer
        transaction={selectedTransaction}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTransactionId(null);
          }
        }}
      />
    </div>
  );
}

