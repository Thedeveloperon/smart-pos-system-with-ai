import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsvFile } from "./csvUtils";
import { fmtCurrency, fmtNum } from "./reportFormatters";
import type { ReportTransactionRow } from "./TransactionDetailDrawer";

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

type Props = {
  rows: ReportTransactionRow[];
  totalCount: number;
  onSelect: (saleId: string) => void;
};

export function TransactionsTab({ rows, totalCount, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Showing {fmtNum(rows.length)} loaded records</Badge>
          <Badge variant="outline">{fmtNum(totalCount)} total records in range</Badge>
          {rows.length < totalCount ? <span>Detail filters work against the latest 1000 loaded records.</span> : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsvFile("transactions.csv", [
              ["Transaction", "Timestamp", "Cashier", "Items", "Amount", "Status"],
              ...rows.map((transaction) => [
                transaction.sale_number,
                transaction.timestamp,
                transaction.cashier_full_name || transaction.cashier_username || "Unassigned",
                String(transaction.items_count),
                String(isSaleTransaction(transaction) ? transaction.grand_total : transaction.cash_movement_amount ?? 0),
                describeTransaction(transaction),
              ]),
            ])
          }
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No transactions match the current detail filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Transaction</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Cashier</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">Items</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">Amount</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((transaction) => (
                <TableRow key={transaction.sale_id}>
                  <TableCell>
                    <button type="button" onClick={() => onSelect(transaction.sale_id)} className="text-left">
                      <div className="font-medium">{transaction.sale_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {isSaleTransaction(transaction) ? "Sale transaction" : "Cash drawer adjustment"}
                      </div>
                    </button>
                  </TableCell>
                  <TableCell>{transaction.cashier_full_name || transaction.cashier_username || "Unassigned"}</TableCell>
                  <TableCell className="text-right">{isSaleTransaction(transaction) ? fmtNum(transaction.items_count) : "---"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {isSaleTransaction(transaction)
                      ? fmtCurrency(transaction.grand_total)
                      : fmtCurrency(transaction.cash_movement_amount ?? 0)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={resolveStatusVariant(transaction.status)}>{describeTransaction(transaction)}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDateTime(transaction.timestamp)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}



