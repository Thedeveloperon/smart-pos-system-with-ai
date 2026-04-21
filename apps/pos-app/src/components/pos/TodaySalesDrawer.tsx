import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CalendarDays, FileDown, Package, ReceiptText, RotateCcw, Sparkles } from "lucide-react";
import { fetchTransactionsReport } from "@/lib/api";
import {
  filterShiftTransactions,
  getDisplayCashShortAmount,
  getTransactionAmount,
  isCashDrawerAdjustment,
  isSalesTransaction,
  openShiftReportPrintWindow,
  signedMoney,
} from "@/lib/shiftReport";
import type { CashSession } from "./cash-session/types";

type TodaySalesDrawerProps = {
  open: boolean;
  onClose: () => void;
  session: CashSession | null;
  cashSalesTotal: number;
  refreshToken?: number;
  onRefundSale?: (saleId: string) => void;
};

type TransactionsItem = Awaited<ReturnType<typeof fetchTransactionsReport>>["items"][number];

const money = (value: number) => `Rs. ${value.toLocaleString()}`;

const PaymentBadge = ({ method }: { method: string }) => {
  const variant: "default" | "secondary" | "outline" =
    method === "cash" ? "default" : method === "card" ? "secondary" : "outline";
  return <Badge variant={variant} className="capitalize text-[10px]">{method}</Badge>;
};

const TodaySalesDrawer = ({
  open,
  onClose,
  session,
  cashSalesTotal,
  refreshToken = 0,
  onRefundSale,
}: TodaySalesDrawerProps) => {
  const [transactions, setTransactions] = useState<TransactionsItem[]>([]);
  const [loading, setLoading] = useState(false);

  const openingCash = session?.opening.total || 0;
  const expectedClosingCash = openingCash + cashSalesTotal;
  const actualClosingCash = session?.closing?.total ?? null;
  const difference = actualClosingCash === null ? null : actualClosingCash - expectedClosingCash;
  const shiftLabel = session ? `Shift ${session.shiftNumber}` : "Shift";

  useEffect(() => {
    if (!open) {
      return;
    }

    let alive = true;
    setLoading(true);

    fetchTransactionsReport()
      .then((tx) => {
        if (!alive) {
          return;
        }
        setTransactions(tx.items);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [open, refreshToken]);

  const paymentTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of transactions.filter(isSalesTransaction)) {
      for (const payment of item.payment_breakdown) {
        totals.set(payment.method, (totals.get(payment.method) || 0) + payment.net_amount);
      }
    }
    return Array.from(totals.entries()).map(([method, total]) => ({ method, total }));
  }, [transactions]);

  const handleExportPdf = () => {
    if (!session || transactions.length === 0) {
      return;
    }

    const shiftTransactions = filterShiftTransactions(transactions, session.openedAt, session.closedAt ?? new Date());
    if (shiftTransactions.length === 0) {
      return;
    }
    const shiftSalesTransactions = shiftTransactions.filter(isSalesTransaction);

    const balanceStatus =
      actualClosingCash === null
        ? "Closing cash has not been recorded yet."
        : difference === 0
          ? "Closing cash balances with the expected amount."
          : `Closing cash differs by ${difference > 0 ? "+" : "-"}${money(Math.abs(difference))}.`;

    openShiftReportPrintWindow(
      {
        title: "Today's Sales Shift Report",
        shiftNumber: session.shiftNumber,
        cashierName: session.cashierName,
        generatedAt: new Date(),
        reportDateLabel: new Date(session.closedAt ?? new Date()).toLocaleDateString(),
        openedAt: session.openedAt,
        closedAt: session.closedAt ?? null,
        openingCash,
        closingCash: actualClosingCash,
        expectedCash: expectedClosingCash,
        cashInDrawer: session.drawer.total ?? 0,
        totalSales: shiftSalesTransactions.length,
        grossSales: shiftSalesTransactions.reduce((sum, sale) => sum + sale.grand_total, 0),
        cashSales: cashSalesTotal,
        cashShortSalesCount: shiftSalesTransactions.filter((sale) => sale.custom_payout_used).length,
        cashShortTotal: shiftSalesTransactions.reduce((sum, sale) => {
          if (!sale.custom_payout_used) {
            return sum;
          }

          const explicitAmount = Math.max(0, sale.cash_short_amount ?? 0);
          const amount = explicitAmount > 0 ? explicitAmount : Math.max(0, Math.round((sale.paid_total - sale.grand_total) * 100) / 100);
          return sum + amount;
        }, 0),
        balanceStatus,
        balanceIsHealthy: difference === 0,
        paymentTotals: Array.from(shiftSalesTransactions.reduce((totals, sale) => {
          for (const payment of sale.payment_breakdown) {
            const total = totals.get(payment.method) ?? 0;
            totals.set(payment.method, total + payment.net_amount);
          }
          return totals;
        }, new Map<string, number>()).entries()).map(([method, total]) => ({ method, total })),
        transactions: shiftTransactions,
      },
      );
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <SheetTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Today&apos;s Sales
                <Badge variant="secondary" className="ml-2 text-[10px] uppercase tracking-wide">
                  {shiftLabel}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                Sales and drawer adjustments for today. Export the shift report as PDF after the shift ends.
              </SheetDescription>
              <p className="text-xs text-muted-foreground">
                Cashier: <span className="font-medium text-foreground">{session?.cashierName || "Unknown"}</span>
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={handleExportPdf}
              disabled={loading || transactions.length === 0}
            >
              <FileDown className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-120px)] -mx-6 px-6">
          <div className="space-y-4 pb-6">
            <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              This view includes sales and drawer adjustments. The printable shift report is generated as a PDF export.
            </div>

            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4 text-primary" />
                  Payment Breakdown
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-4">
                {paymentTotals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                ) : (
                  paymentTotals.map((item) => (
                    <div key={item.method} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                      <span className="capitalize">{item.method}</span>
                      <span className="font-semibold">{money(item.total)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ReceiptText className="h-4 w-4 text-primary" />
                  Transactions
                </div>
                <Badge variant="secondary">{transactions.length}</Badge>
              </div>

              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading today&apos;s sales...</div>
              ) : transactions.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <AlertTriangle className="mx-auto mb-2 h-10 w-10 opacity-30" />
                  No transactions recorded today.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {transactions.map((sale) => {
                    const isDrawerAdjustment = isCashDrawerAdjustment(sale);
                    const canRefund = !isDrawerAdjustment && (sale.status === "completed" || sale.status === "refundedpartially");
                    const rowAmount = isDrawerAdjustment ? signedMoney(getTransactionAmount(sale)) : money(sale.grand_total);
                    const rowAmountLabel = isDrawerAdjustment ? "Movement" : "Paid";
                    const statusLabel = sale.status.replaceAll("_", " ");

                    return (
                      <div
                        key={sale.sale_id}
                        data-testid={
                          isDrawerAdjustment
                            ? `cash-drawer-adjustment-${sale.sale_id}`
                            : sale.custom_payout_used
                              ? `cash-short-sale-${sale.sale_id}`
                              : undefined
                        }
                        className={`flex items-start justify-between gap-3 px-4 py-3 transition-colors ${
                          isDrawerAdjustment
                            ? "border-l-2 border-amber-500 bg-amber-50/70"
                            : sale.custom_payout_used
                              ? "border-l-2 border-destructive bg-red-50/80"
                              : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold">
                              {isDrawerAdjustment ? "Drawer adjustment" : sale.sale_number}
                            </p>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {statusLabel}
                            </Badge>
                            {isDrawerAdjustment ? (
                              <Badge variant="secondary" className="text-[10px]">
                                Adjustment
                              </Badge>
                            ) : sale.custom_payout_used ? (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="destructive"
                                      className="gap-1 text-[10px] font-semibold"
                                      title="Custom payout override"
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      Cash short {signedMoney(getDisplayCashShortAmount(sale))}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Custom payout override</TooltipContent>
                                </Tooltip>
                              </>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(sale.timestamp).toLocaleString()} · {sale.items_count} items
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Cashier: <span className="font-medium text-foreground">{session?.cashierName || "Unknown"}</span>
                          </p>
                          {isDrawerAdjustment ? (
                            <p className="mt-1 text-xs font-medium text-amber-700">
                              Cash drawer {sale.status === "cash_added" ? "added" : "removed"} outside a sale
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {sale.payment_breakdown.map((payment) => (
                              <PaymentBadge key={`${sale.sale_id}-${payment.method}`} method={payment.method} />
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                          <div>
                            <p className={`font-bold ${isDrawerAdjustment ? "text-amber-600" : "text-primary"}`}>
                              {rowAmount}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {rowAmountLabel} {isDrawerAdjustment ? rowAmount : money(sale.paid_total)}
                            </p>
                          </div>
                          {canRefund && onRefundSale && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => onRefundSale(sale.sale_id)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Refund
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default TodaySalesDrawer;
