import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtCurrency, fmtNum } from "./reportFormatters";

export type ReportTransactionRow = {
  sale_id: string;
  sale_number: string;
  status: string;
  timestamp: string;
  cashier_username?: string | null;
  cashier_full_name?: string | null;
  items_count: number;
  grand_total: number;
  paid_total: number;
  reversed_total: number;
  net_collected: number;
  custom_payout_used: boolean;
  cash_short_amount: number;
  transaction_type?: string;
  cash_movement_amount?: number | null;
  payment_breakdown: {
    method: string;
    count: number;
    paid_amount: number;
    reversed_amount: number;
    net_amount: number;
  }[];
  line_items: {
    sale_item_id: string;
    product_id: string;
    product_name: string;
    category_name?: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
};

function isSaleTransaction(transaction: ReportTransactionRow) {
  return (transaction.transaction_type ?? "sale") === "sale";
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

function describeTransaction(transaction: ReportTransactionRow) {
  if (!isSaleTransaction(transaction)) {
    return transaction.status === "cash_removed" ? "Cash removed" : "Cash added";
  }

  return transaction.status.replaceAll("_", " ");
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

function resolveCategoryLabel(categoryName?: string | null) {
  return categoryName?.trim() || "Uncategorized";
}

type Props = {
  transaction: ReportTransactionRow | null;
  onOpenChange: (open: boolean) => void;
};

export function TransactionDetailDrawer({ transaction, onOpenChange }: Props) {
  return (
    <Sheet open={!!transaction} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {transaction ? (
          <div className="space-y-6">
            <SheetHeader>
              <SheetTitle>{transaction.sale_number}</SheetTitle>
              <SheetDescription>
                {describeTransaction(transaction)} recorded on {formatDateTime(transaction.timestamp)}
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
                    <span>{transaction.cashier_full_name || transaction.cashier_username || "Unassigned"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={resolveStatusVariant(transaction.status)}>{describeTransaction(transaction)}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Items</span>
                    <span>{isSaleTransaction(transaction) ? fmtNum(transaction.items_count) : "---"}</span>
                  </div>
                  {transaction.custom_payout_used ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Manual payout was used for this sale.
                    </div>
                  ) : null}
                  {transaction.cash_short_amount > 0 ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      Cash short amount: {fmtCurrency(transaction.cash_short_amount)}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{isSaleTransaction(transaction) ? "Amounts" : "Cash Movement"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {isSaleTransaction(transaction) ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Gross total</span>
                        <span>{fmtCurrency(transaction.grand_total)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Paid total</span>
                        <span>{fmtCurrency(transaction.paid_total)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Reversed</span>
                        <span>{fmtCurrency(transaction.reversed_total)}</span>
                      </div>
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-muted-foreground">Net collected</span>
                        <span>{fmtCurrency(transaction.net_collected)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-muted-foreground">Drawer movement</span>
                      <span>{fmtCurrency(transaction.cash_movement_amount ?? 0)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {isSaleTransaction(transaction) ? (
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
                        {transaction.line_items.map((lineItem) => (
                          <TableRow key={lineItem.sale_item_id}>
                            <TableCell className="font-medium">{lineItem.product_name}</TableCell>
                            <TableCell>{resolveCategoryLabel(lineItem.category_name)}</TableCell>
                            <TableCell className="text-right">{fmtNum(lineItem.quantity)}</TableCell>
                            <TableCell className="text-right">{fmtCurrency(lineItem.unit_price)}</TableCell>
                            <TableCell className="text-right">{fmtCurrency(lineItem.line_total)}</TableCell>
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
                    {transaction.payment_breakdown.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No payment data is available for this transaction.</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Method</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead className="text-right">Reversed</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transaction.payment_breakdown.map((payment) => (
                            <TableRow key={payment.method}>
                              <TableCell className="font-medium">
                                {payment.method.replace(/^\w/, (character) => character.toUpperCase())}
                              </TableCell>
                              <TableCell className="text-right">{fmtNum(payment.count)}</TableCell>
                              <TableCell className="text-right">{fmtCurrency(payment.paid_amount)}</TableCell>
                              <TableCell className="text-right">{fmtCurrency(payment.reversed_amount)}</TableCell>
                              <TableCell className="text-right">{fmtCurrency(payment.net_amount)}</TableCell>
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
                  This entry reflects a cash drawer change and does not contain product line items.
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}



