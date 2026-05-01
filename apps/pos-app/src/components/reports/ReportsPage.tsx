import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  DollarSign,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchDailySalesReport,
  fetchPaymentBreakdownReport,
  fetchProducts,
  fetchTopItemsReport,
  fetchTransactionsReport,
  type Product,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  onBack?: () => void;
  compact?: boolean;
};

type ReportSection = "sales" | "transactions" | "products" | "payments";
type DailySalesReport = Awaited<ReturnType<typeof fetchDailySalesReport>>;
type TransactionsReport = Awaited<ReturnType<typeof fetchTransactionsReport>>;
type PaymentBreakdownReport = Awaited<ReturnType<typeof fetchPaymentBreakdownReport>>;
type TopItemsReport = Awaited<ReturnType<typeof fetchTopItemsReport>>;
type TransactionRow = TransactionsReport["items"][number];

type ReportData = {
  products: Product[];
  summary: DailySalesReport;
  transactions: TransactionsReport;
  payments: PaymentBreakdownReport;
  topItems: TopItemsReport;
};

type ProductPerformanceRow = {
  productId: string;
  productName: string;
  categoryName: string;
  soldQuantity: number;
  netSales: number;
  transactionCount: number;
};

type SummaryCardProps = {
  active: boolean;
  hint: string;
  icon: typeof DollarSign;
  label: string;
  onClick: () => void;
  value: string;
};

const ALL_FILTER_VALUE = "__all__";
const UNCATEGORIZED_FILTER_VALUE = "__uncategorized__";
const TRANSACTION_TAKE = 1000;

const today = new Date();
const defaultToDate = formatDateInput(today);
const defaultFromDate = formatDateInput(
  new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6),
);

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value: number) {
  const hasFraction = Math.abs(value % 1) > 0.0001;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
}

function formatShortDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

function isSaleTransaction(transaction: TransactionRow) {
  return (transaction.transaction_type ?? "sale") === "sale";
}

function buildProductPerformance(transactions: TransactionRow[]) {
  const itemsByProduct = new Map<
    string,
    {
      categoryName: string;
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
        categoryName: resolveCategoryLabel(lineItem.category_name),
        netSales: lineItem.line_total,
        productName: lineItem.product_name,
        soldQuantity: lineItem.quantity,
        transactionIds: new Set([transaction.sale_id]),
      });
    });
  });

  return Array.from(itemsByProduct.entries())
    .map(([productId, value]) => ({
      productId,
      productName: value.productName,
      categoryName: value.categoryName,
      soldQuantity: value.soldQuantity,
      netSales: value.netSales,
      transactionCount: value.transactionIds.size,
    }))
    .sort((left, right) => {
      if (right.soldQuantity !== left.soldQuantity) {
        return right.soldQuantity - left.soldQuantity;
      }
      return right.netSales - left.netSales;
    });
}

function resolveStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed" || status === "cash_added") {
    return "default";
  }
  if (status.includes("refunded")) {
    return "secondary";
  }
  if (status === "cash_removed" || status === "voided") {
    return "destructive";
  }
  return "outline";
}

function describeTransaction(transaction: TransactionRow) {
  if (!isSaleTransaction(transaction)) {
    return transaction.status === "cash_removed" ? "Cash removed" : "Cash added";
  }

  return transaction.status.replaceAll("_", " ");
}

function SummaryCard({ active, hint, icon: Icon, label, onClick, value }: SummaryCardProps) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card
        className={cn(
          "h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
          active && "border-primary/50 ring-2 ring-primary/15",
        )}
      >
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="mt-1 truncate text-2xl font-semibold">{value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
            </div>
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
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
          <Skeleton key={index} className="h-32 rounded-xl" />
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
  const [activeSection, setActiveSection] = useState<ReportSection>("transactions");
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const requestSequenceRef = useRef(0);
  const salesSectionRef = useRef<HTMLDivElement | null>(null);
  const transactionsSectionRef = useRef<HTMLDivElement | null>(null);
  const productsSectionRef = useRef<HTMLDivElement | null>(null);
  const paymentsSectionRef = useRef<HTMLDivElement | null>(null);

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
        const [products, summary, transactions, payments, topItems] = await Promise.all([
          fetchProducts(),
          fetchDailySalesReport(fromDate, toDate),
          fetchTransactionsReport(fromDate, toDate, TRANSACTION_TAKE),
          fetchPaymentBreakdownReport(fromDate, toDate),
          fetchTopItemsReport(fromDate, toDate, 25),
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

    const selectedProductStillMatches = productOptions.some(
      (product) => product.id === productFilter,
    );
    if (!selectedProductStillMatches) {
      setProductFilter(ALL_FILTER_VALUE);
    }
  }, [productFilter, productOptions]);

  const allTransactions = reportData?.transactions.items ?? [];
  const filteredTransactions = allTransactions.filter((transaction) => {
    if (categoryFilter === ALL_FILTER_VALUE && productFilter === ALL_FILTER_VALUE) {
      return true;
    }

    if (!isSaleTransaction(transaction)) {
      return false;
    }

    const matchesCategory =
      categoryFilter === ALL_FILTER_VALUE ||
      transaction.line_items.some(
        (lineItem) => normalizeCategoryFilterValue(lineItem.category_id) === categoryFilter,
      );
    const matchesProduct =
      productFilter === ALL_FILTER_VALUE ||
      transaction.line_items.some((lineItem) => lineItem.product_id === productFilter);

    return matchesCategory && matchesProduct;
  });
  const filteredSalesTransactions = filteredTransactions.filter(isSaleTransaction);
  const productPerformance =
    categoryFilter !== ALL_FILTER_VALUE || productFilter !== ALL_FILTER_VALUE
      ? buildProductPerformance(filteredSalesTransactions)
      : (reportData?.topItems.items ?? []).map((item) => {
          const matchingProduct = products.find((product) => product.id === item.product_id);
          return {
            productId: item.product_id,
            productName: item.product_name,
            categoryName: resolveCategoryLabel(matchingProduct?.category_name),
            soldQuantity: item.net_quantity,
            netSales: item.net_sales,
            transactionCount: 0,
          } satisfies ProductPerformanceRow;
        });

  useEffect(() => {
    if (!selectedTransactionId) {
      return;
    }

    const transactionStillVisible = filteredTransactions.some(
      (transaction) => transaction.sale_id === selectedTransactionId,
    );
    if (!transactionStillVisible) {
      setSelectedTransactionId(null);
    }
  }, [filteredTransactions, selectedTransactionId]);

  const selectedTransaction =
    filteredTransactions.find((transaction) => transaction.sale_id === selectedTransactionId) ??
    null;

  const summary = reportData?.summary;
  const topProduct = reportData?.topItems.items[0] ?? null;
  const averageSaleValue =
    summary && summary.sales_count > 0 ? summary.gross_sales_total / summary.sales_count : 0;
  const selectedCategoryLabel =
    categoryOptions.find((option) => option.value === categoryFilter)?.label ?? "All categories";
  const selectedProductLabel =
    productOptions.find((product) => product.id === productFilter)?.name ?? "All products";

  const focusSection = (section: ReportSection) => {
    setActiveSection(section);

    const sectionRef =
      section === "sales"
        ? salesSectionRef
        : section === "transactions"
          ? transactionsSectionRef
          : section === "products"
            ? productsSectionRef
            : paymentsSectionRef;

    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetFilters = () => {
    setFromDate(defaultFromDate);
    setToDate(defaultToDate);
    setCategoryFilter(ALL_FILTER_VALUE);
    setProductFilter(ALL_FILTER_VALUE);
  };

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
                <p className="text-xs text-pos-header-foreground/70">
                  Date-based dashboard with transaction drill-down and filterable detail tables
                </p>
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

      <div className={compact ? "space-y-4" : "mx-auto max-w-7xl space-y-4 px-4 py-6"}>
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base">Report Controls</CardTitle>
                <CardDescription>
                  The date range updates all report totals. Product and category filters refine the
                  transaction and product detail views.
                </CardDescription>
              </div>
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                Date range controls the visible report data
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="reports-from-date">From</Label>
                <Input
                  id="reports-from-date"
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reports-to-date">To</Label>
                <Input
                  id="reports-to-date"
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
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
                <Button variant="outline" onClick={resetFilters}>
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
              <SummaryCard
                active={activeSection === "sales"}
                icon={DollarSign}
                label="Net Sales"
                value={formatMoney(summary.net_sales_total)}
                hint={`${formatQuantity(summary.refund_count)} refunds in the selected range`}
                onClick={() => focusSection("sales")}
              />
              <SummaryCard
                active={activeSection === "transactions"}
                icon={ShoppingCart}
                label="Transactions"
                value={formatQuantity(summary.sales_count)}
                hint={
                  summary.sales_count > 0
                    ? `Avg ${formatMoney(averageSaleValue)} per completed sale`
                    : "No completed sales in range"
                }
                onClick={() => focusSection("transactions")}
              />
              <SummaryCard
                active={activeSection === "products"}
                icon={TrendingUp}
                label="Top Product"
                value={topProduct?.product_name || "No sales yet"}
                hint={
                  topProduct
                    ? `${formatQuantity(topProduct.net_quantity)} sold`
                    : "No product ranking available"
                }
                onClick={() => focusSection("products")}
              />
              <SummaryCard
                active={activeSection === "products"}
                icon={Package}
                label="Items Sold"
                value={formatQuantity(summary.items_sold_total)}
                hint={`Across ${formatQuantity(summary.sales_count)} completed sales`}
                onClick={() => focusSection("products")}
              />
            </div>

            <div ref={salesSectionRef} className="scroll-mt-20">
              <Card className={cn(activeSection === "sales" && "border-primary/40 shadow-md")}>
                <CardHeader>
                  <CardTitle className="text-base">Daily Sales Summary</CardTitle>
                  <CardDescription>
                    Day-by-day net sales, refund activity, and item volumes for the selected date
                    range.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Refunds</TableHead>
                        <TableHead className="text-right">Items Sold</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.items.map((row) => (
                        <TableRow key={row.date}>
                          <TableCell className="font-medium">{formatShortDate(row.date)}</TableCell>
                          <TableCell className="text-right">
                            {formatQuantity(row.sales_count)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatQuantity(row.refund_count)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatQuantity(row.items_sold)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(row.gross_sales)}
                          </TableCell>
                          <TableCell className="text-right">{formatMoney(row.net_sales)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <div ref={transactionsSectionRef} className="scroll-mt-20">
              <Card
                className={cn(activeSection === "transactions" && "border-primary/40 shadow-md")}
              >
                <CardHeader>
                  <CardTitle className="text-base">Transaction Ledger</CardTitle>
                  <CardDescription>
                    Click any row to inspect line items, payment mix, cashier details, and cash
                    drawer movements.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">
                      Showing {filteredTransactions.length} loaded records
                    </Badge>
                    <Badge variant="outline">
                      {reportData.transactions.transaction_count} total records in range
                    </Badge>
                    {reportData.transactions.items.length <
                    reportData.transactions.transaction_count ? (
                      <span>Detail filters work against the latest 1000 loaded records.</span>
                    ) : null}
                  </div>

                  {filteredTransactions.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      No transactions match the current detail filters.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Transaction</TableHead>
                          <TableHead>Cashier</TableHead>
                          <TableHead className="text-right">Items</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransactions.map((transaction) => (
                          <TableRow key={transaction.sale_id}>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => setSelectedTransactionId(transaction.sale_id)}
                                className="text-left"
                              >
                                <div className="font-medium">{transaction.sale_number}</div>
                                <div className="text-xs text-muted-foreground">
                                  {isSaleTransaction(transaction)
                                    ? "Sale transaction"
                                    : "Cash drawer adjustment"}
                                </div>
                              </button>
                            </TableCell>
                            <TableCell>
                              {transaction.cashier_full_name ||
                                transaction.cashier_username ||
                                "Unassigned"}
                            </TableCell>
                            <TableCell className="text-right">
                              {isSaleTransaction(transaction)
                                ? formatQuantity(transaction.items_count)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {isSaleTransaction(transaction)
                                ? formatMoney(transaction.grand_total)
                                : formatMoney(transaction.cash_movement_amount ?? 0)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={resolveStatusVariant(transaction.status)}>
                                {describeTransaction(transaction)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatDateTime(transaction.timestamp)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            <div ref={productsSectionRef} className="scroll-mt-20">
              <Card className={cn(activeSection === "products" && "border-primary/40 shadow-md")}>
                <CardHeader>
                  <CardTitle className="text-base">Product Performance</CardTitle>
                  <CardDescription>
                    Ranked products for the selected date range. Category and product filters apply
                    here directly.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">
                      {categoryFilter === ALL_FILTER_VALUE
                        ? "All categories"
                        : selectedCategoryLabel}
                    </Badge>
                    <Badge variant="outline">
                      {productFilter === ALL_FILTER_VALUE ? "All products" : selectedProductLabel}
                    </Badge>
                    {categoryFilter !== ALL_FILTER_VALUE || productFilter !== ALL_FILTER_VALUE ? (
                      <span>Filtered ranking is generated from the loaded transaction set.</span>
                    ) : null}
                  </div>

                  {productPerformance.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      No product activity matches the selected filters.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Qty Sold</TableHead>
                          <TableHead className="text-right">Net Sales</TableHead>
                          <TableHead className="text-right">Transactions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productPerformance.map((item) => (
                          <TableRow key={item.productId}>
                            <TableCell className="font-medium">{item.productName}</TableCell>
                            <TableCell>{item.categoryName}</TableCell>
                            <TableCell className="text-right">
                              {formatQuantity(item.soldQuantity)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(item.netSales)}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.transactionCount > 0
                                ? formatQuantity(item.transactionCount)
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            <div ref={paymentsSectionRef} className="scroll-mt-20">
              <Card className={cn(activeSection === "payments" && "border-primary/40 shadow-md")}>
                <CardHeader>
                  <CardTitle className="text-base">Payment Breakdown</CardTitle>
                  <CardDescription>
                    Payment totals stay scoped to the selected date range. Product and category
                    filters do not alter this section.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {reportData.payments.items.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      No payment activity is available for the selected date range.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Reversed</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.payments.items.map((payment) => (
                          <TableRow key={payment.method}>
                            <TableCell className="font-medium">
                              {payment.method.replace(/^\w/, (character) =>
                                character.toUpperCase(),
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(payment.paid_amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(payment.reversed_amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(payment.net_amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>

      <Sheet
        open={!!selectedTransaction}
        onOpenChange={(open) => !open && setSelectedTransactionId(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selectedTransaction ? (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle>{selectedTransaction.sale_number}</SheetTitle>
                <SheetDescription>
                  {describeTransaction(selectedTransaction)} recorded on{" "}
                  {formatDateTime(selectedTransaction.timestamp)}
                </SheetDescription>
              </SheetHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Transaction Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cashier</span>
                      <span>
                        {selectedTransaction.cashier_full_name ||
                          selectedTransaction.cashier_username ||
                          "Unassigned"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={resolveStatusVariant(selectedTransaction.status)}>
                        {describeTransaction(selectedTransaction)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Items</span>
                      <span>
                        {isSaleTransaction(selectedTransaction)
                          ? formatQuantity(selectedTransaction.items_count)
                          : "—"}
                      </span>
                    </div>
                    {selectedTransaction.custom_payout_used ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Manual payout was used for this sale.
                      </div>
                    ) : null}
                    {selectedTransaction.cash_short_amount > 0 ? (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        Cash short amount: {formatMoney(selectedTransaction.cash_short_amount)}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">
                      {isSaleTransaction(selectedTransaction) ? "Amounts" : "Cash Movement"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {isSaleTransaction(selectedTransaction) ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Gross total</span>
                          <span>{formatMoney(selectedTransaction.grand_total)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Paid total</span>
                          <span>{formatMoney(selectedTransaction.paid_total)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Reversed</span>
                          <span>{formatMoney(selectedTransaction.reversed_total)}</span>
                        </div>
                        <div className="flex items-center justify-between font-medium">
                          <span className="text-muted-foreground">Net collected</span>
                          <span>{formatMoney(selectedTransaction.net_collected)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-muted-foreground">Drawer movement</span>
                        <span>{formatMoney(selectedTransaction.cash_movement_amount ?? 0)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {isSaleTransaction(selectedTransaction) ? (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Line Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Line Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedTransaction.line_items.map((lineItem) => (
                            <TableRow key={lineItem.sale_item_id}>
                              <TableCell className="font-medium">{lineItem.product_name}</TableCell>
                              <TableCell>{resolveCategoryLabel(lineItem.category_name)}</TableCell>
                              <TableCell className="text-right">
                                {formatQuantity(lineItem.quantity)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatMoney(lineItem.unit_price)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatMoney(lineItem.line_total)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Wallet className="h-4 w-4" />
                        Payment Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedTransaction.payment_breakdown.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          No payment data is available for this transaction.
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Method</TableHead>
                              <TableHead className="text-right">Paid</TableHead>
                              <TableHead className="text-right">Reversed</TableHead>
                              <TableHead className="text-right">Net</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedTransaction.payment_breakdown.map((payment) => (
                              <TableRow key={payment.method}>
                                <TableCell className="font-medium">
                                  {payment.method.replace(/^\w/, (character) =>
                                    character.toUpperCase(),
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatMoney(payment.paid_amount)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatMoney(payment.reversed_amount)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatMoney(payment.net_amount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Adjustment Details</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    This entry reflects a cash drawer change and does not contain product line
                    items.
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
