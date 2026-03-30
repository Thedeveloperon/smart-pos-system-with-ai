import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CalendarDays, DollarSign, Package, ReceiptText, RotateCcw, Wallet } from "lucide-react";
import { fetchDailySalesReport, fetchTransactionsReport } from "@/lib/api";
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
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchDailySalesReport>> | null>(null);
  const [transactions, setTransactions] = useState<TransactionsItem[]>([]);
  const [loading, setLoading] = useState(false);

  const openingCash = session?.opening.total || 0;
  const expectedClosingCash = openingCash + cashSalesTotal;
  const actualClosingCash = session?.closing?.total ?? null;
  const difference = actualClosingCash === null ? null : actualClosingCash - expectedClosingCash;

  useEffect(() => {
    if (!open) {
      return;
    }

    let alive = true;
    setLoading(true);

    Promise.all([fetchDailySalesReport(), fetchTransactionsReport()])
      .then(([daily, tx]) => {
        if (!alive) {
          return;
        }
        setSummary(daily);
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
    for (const item of transactions) {
      for (const payment of item.payment_breakdown) {
        totals.set(payment.method, (totals.get(payment.method) || 0) + payment.net_amount);
      }
    }
    return Array.from(totals.entries()).map(([method, total]) => ({ method, total }));
  }, [transactions]);

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Today&apos;s Sales
          </SheetTitle>
          <SheetDescription>
            Individual sales for today with opening cash, cash sales, and closing cash comparison.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-4 -mx-6 px-6">
          <div className="space-y-4 pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border p-4 bg-card">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Wallet className="h-4 w-4" />
                  Day Begin Cash Count
                </div>
                <div className="text-2xl font-bold">{money(openingCash)}</div>
              </div>
              <div className="rounded-xl border border-border p-4 bg-card">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Wallet className="h-4 w-4" />
                  Day End Cash Count
                </div>
                <div className="text-2xl font-bold">
                  {actualClosingCash === null ? "Not closed yet" : money(actualClosingCash)}
                </div>
                {difference !== null && (
                  <div className={`mt-1 text-sm ${difference === 0 ? "text-success" : difference < 0 ? "text-destructive" : "text-warning"}`}>
                    Difference: {difference === 0 ? "Balanced" : `${difference > 0 ? "+" : "-"}${money(Math.abs(difference))}`}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border p-4 bg-card">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <ReceiptText className="h-3.5 w-3.5" />
                  Sales Count
                </div>
                <div className="text-xl font-bold">{summary?.sales_count ?? 0}</div>
              </div>
              <div className="rounded-xl border border-border p-4 bg-card">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  Gross Sales
                </div>
                <div className="text-xl font-bold">{money(summary?.gross_sales_total ?? 0)}</div>
              </div>
              <div className="rounded-xl border border-border p-4 bg-card">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  Cash Sales
                </div>
                <div className="text-xl font-bold">{money(cashSalesTotal)}</div>
              </div>
              <div className="rounded-xl border border-border p-4 bg-card">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  Expected Cash
                </div>
                <div className="text-xl font-bold">{money(expectedClosingCash)}</div>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4 text-primary" />
                  Payment Breakdown
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                  Individual Sales
                </div>
                <Badge variant="secondary">{transactions.length}</Badge>
              </div>

              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading today&apos;s sales...</div>
              ) : transactions.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No sales recorded today.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {transactions.map((sale) => {
                    const canRefund = sale.status === "completed" || sale.status === "refundedpartially";

                    return (
                      <div key={sale.sale_id} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{sale.sale_number}</p>
                            <Badge variant="outline" className="text-[10px] capitalize">{sale.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(sale.timestamp).toLocaleString()} · {sale.items_count} items
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {sale.payment_breakdown.map((payment) => (
                              <PaymentBadge key={`${sale.sale_id}-${payment.method}`} method={payment.method} />
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                          <div>
                            <p className="font-bold text-primary">{money(sale.grand_total)}</p>
                            <p className="text-xs text-muted-foreground">Paid {money(sale.paid_total)}</p>
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
