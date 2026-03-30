import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  DollarSign,
  Layers3,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  FileDown,
  FileText,
  UserRound,
  Wallet,
} from "lucide-react";
import {
  fetchDailySalesReport,
  fetchLowStockReport,
  fetchPaymentBreakdownReport,
  fetchTopItemsReport,
  fetchTransactionsReport,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ManagerReportsDrawerProps = {
  open: boolean;
  onClose: () => void;
};

type TransactionsItem = Awaited<ReturnType<typeof fetchTransactionsReport>>["items"][number];
type PaymentBreakdownItem = Awaited<ReturnType<typeof fetchPaymentBreakdownReport>>["items"][number];
type TopItem = Awaited<ReturnType<typeof fetchTopItemsReport>>["items"][number];
type LowStockItem = Awaited<ReturnType<typeof fetchLowStockReport>>["items"][number];

type ReportData = {
  summary: Awaited<ReturnType<typeof fetchDailySalesReport>> | null;
  transactions: TransactionsItem[];
  payments: PaymentBreakdownItem[];
  topItems: TopItem[];
  lowStock: LowStockItem[];
};

const money = (value: number) => `Rs. ${value.toLocaleString()}`;
const today = new Date();
const defaultFromDate = new Date(today);
defaultFromDate.setDate(today.getDate() - 6);

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);
const formatDate = (value: string) => new Date(value).toLocaleDateString();

const escapeCsvValue = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const downloadCsvFile = (filename: string, rows: string[][]) => {
  const blob = new Blob([rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const openPrintableReport = (title: string, bodyHtml: string) => {
  const printWindow = window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) {
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
          .title { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
          .muted { color: #6b7280; font-size: 12px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
          .card .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .08em; }
          .card .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; vertical-align: top; }
          th { font-size: 11px; text-transform: uppercase; color: #6b7280; }
          .section { margin-top: 18px; }
          .section h2 { font-size: 16px; margin: 0 0 8px; }
          .footer { margin-top: 18px; font-size: 11px; color: #6b7280; }
        </style>
      </head>
      <body>
        ${bodyHtml}
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

const StatCard = ({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="rounded-2xl bg-primary/10 p-3 text-primary">{icon}</div>
    </div>
  </div>
);

const BadgeTone = ({ method }: { method: string }) => {
  const variant: "default" | "secondary" | "outline" =
    method === "cash" ? "default" : method === "card" ? "secondary" : "outline";
  return <Badge variant={variant} className="capitalize text-[10px]">{method}</Badge>;
};

const ManagerReportsDrawer = ({ open, onClose }: ManagerReportsDrawerProps) => {
  const [fromDate, setFromDate] = useState(formatDateInput(defaultFromDate));
  const [toDate, setToDate] = useState(formatDateInput(today));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData>({
    summary: null,
    transactions: [],
    payments: [],
    topItems: [],
    lowStock: [],
  });

  const loadReports = async () => {
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T00:00:00`);

    setLoading(true);
    try {
      const [summary, transactions, payments, topItems, lowStock] = await Promise.all([
        fetchDailySalesReport(from, to),
        fetchTransactionsReport(from, to, 50),
        fetchPaymentBreakdownReport(from, to),
        fetchTopItemsReport(from, to, 8),
        fetchLowStockReport(12, 5),
      ]);

      setReport({
        summary,
        transactions: transactions.items,
        payments: payments.items,
        topItems: topItems.items,
        lowStock: lowStock.items,
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadReports();
  }, [open, fromDate, toDate]);

  const overview = useMemo(() => {
    const cashierMap = new Map<string, number>();
    for (const item of report.transactions) {
      const label = item.cashier_full_name || item.cashier_username || "Unknown";
      cashierMap.set(label, (cashierMap.get(label) || 0) + item.net_collected);
    }

    return Array.from(cashierMap.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4);
  }, [report.transactions]);

  const handleExportSalesCsv = () => {
    if (report.transactions.length === 0) {
      toast.info("No sales data to export.");
      return;
    }

    downloadCsvFile(`sales-report-${fromDate}-to-${toDate}.csv`, [
      ["Manager Reports", ""],
      ["Range", `${fromDate} to ${toDate}`],
      ["Sales Count", report.summary?.sales_count ?? 0],
      ["Gross Sales", report.summary?.gross_sales_total ?? 0],
      ["Net Sales", report.summary?.net_sales_total ?? 0],
      [],
      ["Sale No", "Cashier", "Timestamp", "Status", "Items", "Grand Total", "Paid Total", "Net Collected"],
      ...report.transactions.map((sale) => [
        sale.sale_number,
        sale.cashier_full_name || sale.cashier_username || "Unknown",
        sale.timestamp,
        sale.status,
        sale.items_count,
        sale.grand_total,
        sale.paid_total,
        sale.net_collected,
      ]),
    ]);
  };

  const handleExportItemsCsv = () => {
    if (report.topItems.length === 0) {
      toast.info("No item data to export.");
      return;
    }

    downloadCsvFile(`items-report-${fromDate}-to-${toDate}.csv`, [
      ["Manager Reports", ""],
      ["Range", `${fromDate} to ${toDate}`],
      [],
      ["Item", "Sold Qty", "Refunded Qty", "Net Qty", "Net Sales"],
      ...report.topItems.map((item) => [
        item.product_name,
        item.sold_quantity,
        item.refunded_quantity,
        item.net_quantity,
        item.net_sales,
      ]),
    ]);
  };

  const handleExportStockCsv = () => {
    if (report.lowStock.length === 0) {
      toast.info("No stock alerts to export.");
      return;
    }

    downloadCsvFile(`stock-report-${fromDate}-to-${toDate}.csv`, [
      ["Manager Reports", ""],
      ["Range", `${fromDate} to ${toDate}`],
      [],
      ["Product", "SKU", "Barcode", "Qty On Hand", "Alert Level", "Deficit"],
      ...report.lowStock.map((item) => [
        item.product_name,
        item.sku || "-",
        item.barcode || "-",
        item.quantity_on_hand,
        item.alert_level,
        item.deficit,
      ]),
    ]);
  };

  const handleExportSalesPdf = () => {
    if (report.transactions.length === 0) {
      toast.info("No sales data to export.");
      return;
    }

    const rows = report.transactions
      .map(
        (sale) => `
          <tr>
            <td>${escapeHtml(sale.sale_number)}</td>
            <td>${escapeHtml(sale.cashier_full_name || sale.cashier_username || "Unknown")}</td>
            <td>${escapeHtml(new Date(sale.timestamp).toLocaleString())}</td>
            <td>${escapeHtml(sale.status)}</td>
            <td style="text-align:right">${escapeHtml(sale.items_count)}</td>
            <td style="text-align:right">${escapeHtml(money(sale.grand_total))}</td>
            <td style="text-align:right">${escapeHtml(money(sale.paid_total))}</td>
          </tr>
        `
      )
      .join("");

    openPrintableReport(
      "Sales Report",
      `
        <div class="header">
          <div>
            <h1 class="title">Sales Report</h1>
            <div class="muted">Range: ${escapeHtml(fromDate)} to ${escapeHtml(toDate)}</div>
          </div>
          <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
        <div class="grid">
          <div class="card"><div class="label">Sales Count</div><div class="value">${escapeHtml(report.summary?.sales_count ?? 0)}</div></div>
          <div class="card"><div class="label">Gross Sales</div><div class="value">${escapeHtml(money(report.summary?.gross_sales_total ?? 0))}</div></div>
          <div class="card"><div class="label">Net Sales</div><div class="value">${escapeHtml(money(report.summary?.net_sales_total ?? 0))}</div></div>
          <div class="card"><div class="label">Low Stock</div><div class="value">${escapeHtml(report.lowStock.length)}</div></div>
        </div>
        <div class="section">
          <h2>Transactions</h2>
          <table>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Cashier</th>
                <th>Time</th>
                <th>Status</th>
                <th style="text-align:right">Items</th>
                <th style="text-align:right">Total</th>
                <th style="text-align:right">Paid</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="footer">Use the browser print dialog and choose Save as PDF.</div>
      `
    );
  };

  const handleExportItemsPdf = () => {
    if (report.topItems.length === 0) {
      toast.info("No item data to export.");
      return;
    }

    const rows = report.topItems
      .map(
        (item, index) => `
          <tr>
            <td>${escapeHtml(index + 1)}</td>
            <td>${escapeHtml(item.product_name)}</td>
            <td style="text-align:right">${escapeHtml(item.sold_quantity)}</td>
            <td style="text-align:right">${escapeHtml(item.refunded_quantity)}</td>
            <td style="text-align:right">${escapeHtml(item.net_quantity)}</td>
            <td style="text-align:right">${escapeHtml(money(item.net_sales))}</td>
          </tr>
        `
      )
      .join("");

    openPrintableReport(
      "Items Report",
      `
        <div class="header">
          <div>
            <h1 class="title">Items Report</h1>
            <div class="muted">Range: ${escapeHtml(fromDate)} to ${escapeHtml(toDate)}</div>
          </div>
          <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
        <div class="section">
          <h2>Top Items</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th style="text-align:right">Sold Qty</th>
                <th style="text-align:right">Refunded Qty</th>
                <th style="text-align:right">Net Qty</th>
                <th style="text-align:right">Net Sales</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="footer">Use the browser print dialog and choose Save as PDF.</div>
      `
    );
  };

  const handleExportStockPdf = () => {
    if (report.lowStock.length === 0) {
      toast.info("No stock alerts to export.");
      return;
    }

    const rows = report.lowStock
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.sku || "-")}</td>
            <td>${escapeHtml(item.barcode || "-")}</td>
            <td style="text-align:right">${escapeHtml(item.quantity_on_hand)}</td>
            <td style="text-align:right">${escapeHtml(item.alert_level)}</td>
            <td style="text-align:right">${escapeHtml(item.deficit)}</td>
          </tr>
        `
      )
      .join("");

    openPrintableReport(
      "Stock Report",
      `
        <div class="header">
          <div>
            <h1 class="title">Stock Report</h1>
            <div class="muted">Range: ${escapeHtml(fromDate)} to ${escapeHtml(toDate)}</div>
          </div>
          <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
        <div class="section">
          <h2>Low Stock Alerts</h2>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th style="text-align:right">Qty On Hand</th>
                <th style="text-align:right">Alert Level</th>
                <th style="text-align:right">Deficit</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="footer">Use the browser print dialog and choose Save as PDF.</div>
      `
    );
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent
        side="right"
        className="inset-0 h-screen w-screen max-w-none rounded-none border-0 p-0 flex flex-col overflow-hidden sm:max-w-none sm:w-screen"
      >
        <div className="border-b border-border bg-pos-header px-6 py-5 text-pos-header-foreground shrink-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <SheetHeader className="space-y-2 text-left">
              <SheetTitle className="flex items-center gap-2 text-xl font-semibold">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Manager Reports
              </SheetTitle>
              <SheetDescription className="text-pos-header-foreground/70">
                Simple operational reports with cashier names, sales totals, payment mix, and stock alerts.
              </SheetDescription>
            </SheetHeader>

            <Button
              variant="outline"
              onClick={onClose}
              className="border-border bg-background text-foreground hover:bg-muted lg:shrink-0"
            >
              Close
            </Button>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[420px]">
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="bg-background text-foreground"
              />
              <Input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="bg-background text-foreground"
              />
            </div>
            <Button onClick={() => void loadReports()} disabled={loading} className="w-fit">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={<CalendarDays className="h-5 w-5" />}
                label="Sales Count"
                value={String(report.summary?.sales_count ?? 0)}
                hint={`${formatDate(fromDate)} to ${formatDate(toDate)}`}
              />
              <StatCard
                icon={<DollarSign className="h-5 w-5" />}
                label="Gross Sales"
                value={money(report.summary?.gross_sales_total ?? 0)}
                hint="Total before refunds"
              />
              <StatCard
                icon={<Wallet className="h-5 w-5" />}
                label="Net Sales"
                value={money(report.summary?.net_sales_total ?? 0)}
                hint="Sales minus refunds"
              />
              <StatCard
                icon={<AlertTriangle className="h-5 w-5" />}
                label="Low Stock"
                value={String(report.lowStock.length)}
                hint="Products at or below alert level"
              />
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="sales">Sales</TabsTrigger>
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger value="stock">Stock</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                  <div className="rounded-2xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold">Cashier Performance</p>
                    </div>
                    <div className="space-y-3 p-4">
                      {overview.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No sales recorded for this range.</p>
                      ) : (
                        overview.map(([name, total]) => (
                          <div key={name} className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <UserRound className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium">{name}</p>
                                <p className="text-xs text-muted-foreground">Net collected</p>
                              </div>
                            </div>
                            <p className="font-semibold">{money(total)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold">Payment Mix</p>
                    </div>
                    <div className="space-y-3 p-4">
                      {report.payments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No payment data available.</p>
                      ) : (
                        report.payments.map((item) => (
                          <div key={item.method} className="rounded-xl border border-border bg-background px-4 py-3">
                            <div className="flex items-center justify-between">
                              <BadgeTone method={item.method} />
                              <p className="font-semibold">{money(item.net_amount)}</p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Paid {money(item.paid_amount)} · Reversed {money(item.reversed_amount)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="sales" className="space-y-4">
                <div className="rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ShoppingCart className="h-4 w-4 text-primary" />
                      Transactions
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportSalesCsv}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileDown className="h-4 w-4" />
                        Sales CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportSalesPdf}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileText className="h-4 w-4" />
                        Sales PDF
                      </Button>
                      <Badge variant="secondary">{report.transactions.length}</Badge>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill</TableHead>
                        <TableHead>Cashier</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                            Loading reports...
                          </TableCell>
                        </TableRow>
                      ) : report.transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                            No sales in this period.
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.transactions.map((sale) => (
                          <TableRow key={sale.sale_id}>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">{sale.sale_number}</p>
                                <div className="flex flex-wrap gap-1">
                                  <Badge variant="outline" className="text-[10px] capitalize">
                                    {sale.status}
                                  </Badge>
                                  {sale.payment_breakdown.map((payment) => (
                                    <BadgeTone key={`${sale.sale_id}-${payment.method}`} method={payment.method} />
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">
                                  {sale.cashier_full_name || sale.cashier_username || "Unknown"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {sale.cashier_username || "No username"}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(sale.timestamp).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {money(sale.grand_total)}
                              <p className="text-xs font-normal text-muted-foreground">
                                Paid {money(sale.paid_total)}
                              </p>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="items" className="space-y-4">
                <div className="rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Layers3 className="h-4 w-4 text-primary" />
                      Top Items
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportItemsCsv}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileDown className="h-4 w-4" />
                        Items CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportItemsPdf}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileText className="h-4 w-4" />
                        Items PDF
                      </Button>
                      <Badge variant="secondary">{report.topItems.length}</Badge>
                    </div>
                  </div>

                  <div className="divide-y divide-border">
                    {report.topItems.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground">No item movement in this range.</div>
                    ) : (
                      report.topItems.map((item, index) => (
                        <div key={item.product_id} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <span className="text-xs font-semibold">#{index + 1}</span>
                            </div>
                            <div>
                              <p className="font-medium">{item.product_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Sold {item.sold_quantity} · Refunded {item.refunded_quantity}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{money(item.net_sales)}</p>
                            <p className="text-xs text-muted-foreground">Net qty {item.net_quantity}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="stock" className="space-y-4">
                <div className="rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Package className="h-4 w-4 text-primary" />
                      Low Stock Alerts
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportStockCsv}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileDown className="h-4 w-4" />
                        Stock CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportStockPdf}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileText className="h-4 w-4" />
                        Stock PDF
                      </Button>
                      <Badge variant="secondary">{report.lowStock.length}</Badge>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU / Barcode</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Alert</TableHead>
                        <TableHead className="text-right">Deficit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.lowStock.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                            No low-stock items right now.
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.lowStock.map((item) => (
                          <TableRow key={item.product_id}>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {item.sku || "-"}
                              {item.barcode ? ` | ${item.barcode}` : ""}
                            </TableCell>
                            <TableCell className="text-right">{item.quantity_on_hand}</TableCell>
                            <TableCell className="text-right">{item.alert_level}</TableCell>
                            <TableCell className="text-right font-semibold text-destructive">
                              {item.deficit}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default ManagerReportsDrawer;
