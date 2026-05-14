import { AlertTriangle, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsvFile } from "./csvUtils";
import { fmtCurrency, fmtNum } from "./reportFormatters";

type LowStockRow = {
  product_id: string;
  product_name: string;
  brand_name?: string | null;
  preferred_supplier_name?: string | null;
  quantity_on_hand: number;
  alert_level: number;
  deficit: number;
};

type GroupedRow = {
  name: string;
  low_stock_count: number;
  total_deficit: number;
  estimated_reorder_value: number;
};

type Props = {
  generatedAt?: string | null;
  lowStock: LowStockRow[];
  byBrand: GroupedRow[];
  bySupplier: GroupedRow[];
};

function formatAsOf(value?: string | null) {
  if (!value) {
    return "No snapshot";
  }
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function InventoryTab({ generatedAt, lowStock, byBrand, bySupplier }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-primary" />
                Low stock items
              </CardTitle>
              <CardDescription>Products at or below their alert level. Reorder values use latest unit cost.</CardDescription>
            </div>
            <Badge variant="outline">As of {formatAsOf(generatedAt)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          <div className="flex justify-end px-6 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsvFile("low-stock-items.csv", [
                  ["Product", "Brand", "Supplier", "On Hand", "Alert Level", "Deficit"],
                  ...lowStock.map((row) => [
                    row.product_name,
                    row.brand_name ?? "Unbranded",
                    row.preferred_supplier_name ?? "No supplier",
                    String(row.quantity_on_hand),
                    String(row.alert_level),
                    String(row.deficit),
                  ]),
                ])
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Product</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Brand</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Supplier</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">On hand</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">Alert level</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">Deficit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lowStock.map((row) => {
                const critical = row.quantity_on_hand <= row.alert_level / 4;
                return (
                  <TableRow key={row.product_id}>
                    <TableCell className="font-medium">{row.product_name}</TableCell>
                    <TableCell>{row.brand_name ?? "Unbranded"}</TableCell>
                    <TableCell>{row.preferred_supplier_name ?? "No supplier"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={critical ? "destructive" : "secondary"}>{fmtNum(row.quantity_on_hand)}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmtNum(row.alert_level)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtNum(row.deficit)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <GroupedCard
          title="By brand"
          description="Aggregated low-stock impact per brand."
          columnLabel="Brand"
          rows={byBrand}
          filename="low-stock-by-brand.csv"
        />
        <GroupedCard
          title="By supplier"
          description="Aggregated low-stock impact per supplier."
          columnLabel="Supplier"
          rows={bySupplier}
          filename="low-stock-by-supplier.csv"
        />
      </div>
    </div>
  );
}

function GroupedCard({
  title,
  description,
  columnLabel,
  rows,
  filename,
}: {
  title: string;
  description: string;
  columnLabel: string;
  rows: GroupedRow[];
  filename: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsvFile(filename, [
                [columnLabel, "Items", "Deficit", "Reorder value"],
                ...rows.map((row) => [
                  row.name,
                  String(row.low_stock_count),
                  String(row.total_deficit),
                  String(row.estimated_reorder_value),
                ]),
              ])
            }
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wider">{columnLabel}</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Items</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Deficit</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Reorder value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.name}-${index}`}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-right">{fmtNum(row.low_stock_count)}</TableCell>
                <TableCell className="text-right">{fmtNum(row.total_deficit)}</TableCell>
                <TableCell className="text-right font-medium">{fmtCurrency(row.estimated_reorder_value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
