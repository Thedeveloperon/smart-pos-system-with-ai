import { Download } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsvFile } from "./csvUtils";
import { fmtCurrency, fmtNum } from "./reportFormatters";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

type PaymentRow = {
  method: string;
  count: number;
  paid_amount: number;
  reversed_amount: number;
  net_amount: number;
};

type Props = {
  rows: PaymentRow[];
};

export function PaymentsTab({ rows }: Props) {
  const total = rows.reduce((sum, row) => sum + row.net_amount, 0);
  const data = rows.map((row) => ({ name: row.method, value: row.net_amount }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsvFile("payments.csv", [
              ["Method", "Count", "Paid", "Reversed", "Net"],
              ...rows.map((row) => [
                row.method,
                String(row.count),
                String(row.paid_amount),
                String(row.reversed_amount),
                String(row.net_amount),
              ]),
            ])
          }
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-72 rounded-md border bg-card p-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => fmtCurrency(value)} />
              <Legend wrapperStyle={{ fontSize: 12, textTransform: "capitalize" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Method</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">Count</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">Net</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.method}>
                  <TableCell className="font-medium capitalize">{row.method}</TableCell>
                  <TableCell className="text-right">{fmtNum(row.count)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtCurrency(row.net_amount)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {total > 0 ? `${Math.round((row.net_amount / total) * 100)}%` : "---"}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No payment activity is available for the selected date range.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}



