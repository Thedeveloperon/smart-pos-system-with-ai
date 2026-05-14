import { Download } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsvFile } from "./csvUtils";
import { fmtCurrency, fmtDate, fmtNum } from "./reportFormatters";

type SalesRow = {
  date: string;
  sales_count: number;
  refund_count: number;
  items_sold: number;
  net_sales: number;
};

export function SalesTab({ rows }: { rows: SalesRow[] }) {
  const chartData = rows.map((row) => ({ date: fmtDate(row.date), net: row.net_sales }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsvFile("sales-summary.csv", [
              ["Date", "Transactions", "Items Sold", "Refunds", "Net Sales"],
              ...rows.map((row) => [
                row.date,
                String(row.sales_count),
                String(row.items_sold),
                String(row.refund_count),
                String(row.net_sales),
              ]),
            ])
          }
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {rows.length > 1 ? (
        <div className="h-56 w-full rounded-md border bg-card p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(value: number) => fmtCurrency(value)} />
              <Line type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wider">Date</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Transactions</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Items Sold</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Refunds</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Net Sales</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.date}>
                <TableCell className="font-medium">{fmtDate(row.date)}</TableCell>
                <TableCell className="text-right">{fmtNum(row.sales_count)}</TableCell>
                <TableCell className="text-right">{fmtNum(row.items_sold)}</TableCell>
                <TableCell className="text-right">{fmtNum(row.refund_count)}</TableCell>
                <TableCell className="text-right font-medium">{fmtCurrency(row.net_sales)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No sales data found for the selected date range.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
