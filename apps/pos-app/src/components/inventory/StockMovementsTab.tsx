import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import { fetchStockMovements, type StockMovement } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import StockMovementTypeBadge from "./StockMovementTypeBadge";

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

  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(productQuery), 300);
    return () => clearTimeout(timer);
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
    let alive = true;
    setLoading(true);
    fetchStockMovements(params)
      .then((res) => {
        if (!alive) {
          return;
        }
        setTotal(res.total);
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
      })
      .catch((error) => {
        if (alive) {
          toast.error(error instanceof Error ? error.message : "Failed to load stock movements.");
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [params, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, type, from, to]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Product</Label>
            <Input
              placeholder="Search by name..."
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
                {TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item === "all" ? "All types" : item}
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
              <History className="mx-auto mb-2 h-8 w-8 opacity-50" />
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
                  {items.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(movement.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{movement.product_name}</TableCell>
                      <TableCell>
                        <StockMovementTypeBadge type={movement.movement_type} />
                      </TableCell>
                      <TableCell className="text-right">{movement.quantity_before}</TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          movement.quantity_change > 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {movement.quantity_change > 0 ? "+" : ""}
                        {movement.quantity_change}
                      </TableCell>
                      <TableCell className="text-right">{movement.quantity_after}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {movement.reference_id ?? movement.reference_type}
                      </TableCell>
                      <TableCell className="text-xs">{movement.reason ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {movement.created_by_user_id ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {items.length < total && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={() => setPage((current) => current + 1)} disabled={loading}>
                    {loading ? "Loading..." : "Load more"}
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
