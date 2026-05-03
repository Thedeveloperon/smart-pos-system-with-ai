import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { downloadCsvFile } from "./csvUtils";
import { fmtCurrency, fmtNum } from "./reportFormatters";

type ProductPerformanceRow = {
  product_id: string;
  product_name: string;
  category: string;
  qty: number;
  net_sales: number;
  transactions?: number;
};

type Props = {
  top: ProductPerformanceRow[];
  worst: ProductPerformanceRow[];
};

export function ProductsTab({ top, worst }: Props) {
  const [view, setView] = useState<"top" | "worst">("top");
  const rows = view === "top" ? top : worst;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-md border bg-muted/50 p-1">
          {(["top", "worst"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setView(value)}
              className={cn(
                "rounded-sm px-4 py-1.5 text-sm font-medium transition-colors",
                view === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "top" ? "Top performers" : "Worst performers"}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsvFile(`${view}-products.csv`, [
              ["Product", "Category", "Net Qty", "Net Sales", "Transactions"],
              ...rows.map((row) => [
                row.product_name,
                row.category,
                String(row.qty),
                String(row.net_sales),
                String(row.transactions ?? 0),
              ]),
            ])
          }
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-xs uppercase tracking-wider">#</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Product</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Category</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Net Qty</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Net Sales</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Transactions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.product_id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{row.product_name}</TableCell>
                <TableCell>{row.category}</TableCell>
                <TableCell className="text-right">{fmtNum(row.qty)}</TableCell>
                <TableCell className={cn("text-right font-medium", row.net_sales < 0 && "text-destructive")}>
                  {fmtCurrency(row.net_sales)}
                </TableCell>
                <TableCell className="text-right">
                  {row.transactions && row.transactions > 0 ? fmtNum(row.transactions) : "---"}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No product activity for the current filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}



