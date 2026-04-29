import { useEffect, useMemo, useState } from "react";
import { fetchStockMovements, type StockMovement } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import StockMovementTypeBadge from "./StockMovementTypeBadge";
import { History } from "lucide-react";

const TYPES = [
  "all",
  "Sale",
  "Purchase",
  "Refund",
  "Adjustment",
  "ExpiryWriteOff",
  "StocktakeReconciliation",
  "Transfer",
];

export default function StockMovementsTab() {
  const [productQuery, setProductQuery] = useState("");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounce text input
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(productQuery), 300);
    return () => clearTimeout(t);
  }, [productQuery]);

  const params = useMemo(
    () => ({
      product_id: debouncedQuery || undefined,
      movement_type: type,
      from_date: from || undefined,
      to_date: to || undefined,
      page,
      take: 20,
    }),
    [debouncedQuery, type, from, to, page],
  );

  useEffect(() => {
    setLoading(true);
    fetchStockMovements(params)
      .then((res) => {
        setTotal(res.total);
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
      })
      .finally(() => setLoading(false));
  }, [params, page]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, type, from, to]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Product</Label>
            <Input
              placeholder="Search by name…"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "all" ? "All types" : t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading && items.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <History className="mx-auto h-8 w-8 mb-2 opacity-50" />
              No movements match your filters.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Before</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">After</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(m.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{m.product_name}</TableCell>
                      <TableCell>
                        <StockMovementTypeBadge type={m.movement_type} />
                      </TableCell>
                      <TableCell className="text-right">{m.quantity_before}</TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          m.quantity_change > 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {m.quantity_change > 0 ? "+" : ""}
                        {m.quantity_change}
                      </TableCell>
                      <TableCell className="text-right">{m.quantity_after}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.reference_id ?? m.reference_type}
                      </TableCell>
                      <TableCell className="text-xs">{m.reason ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.created_by_user_id ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {items.length < total && (
                <div className="flex justify-center mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={loading}
                  >
                    {loading ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
