import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  History,
} from "lucide-react";
import {
  fetchProductCatalogItems,
  fetchStockMovements,
  type CatalogProduct,
  type StockMovement,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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

const PAGE_SIZE = 20;

function formatCsvValue(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function toCsv(items: StockMovement[]) {
  const rows = [
    [
      "created_at",
      "product_name",
      "movement_type",
      "quantity_before",
      "quantity_change",
      "quantity_after",
      "reference",
      "reason",
      "created_by",
    ],
    ...items.map((movement) => [
      new Date(movement.created_at).toISOString(),
      movement.product_name,
      movement.movement_type,
      movement.quantity_before,
      movement.quantity_change,
      movement.quantity_after,
      movement.reference_id ?? movement.reference_type,
      movement.reason ?? "",
      movement.created_by_username ?? movement.created_by_user_id ?? "",
    ]),
  ];

  return rows.map((row) => row.map(formatCsvValue).join(",")).join("\n");
}

export default function StockMovementsTab() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productFilterOpen, setProductFilterOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [exporting, setExporting] = useState(false);

  const params = useMemo(
    () => ({
      product_id: selectedProductId || undefined,
      movement_type: type,
      from_date: from || undefined,
      to_date: to || undefined,
      page,
      take: PAGE_SIZE,
    }),
    [selectedProductId, type, from, to, page],
  );

  useEffect(() => {
    let alive = true;
    setLoadingProducts(true);
    fetchProductCatalogItems(200, true)
      .then((rows) => {
        if (alive) {
          setProducts(rows);
        }
      })
      .catch((error) => {
        if (alive) {
          toast.error(error instanceof Error ? error.message : "Failed to load products.");
        }
      })
      .finally(() => {
        if (alive) {
          setLoadingProducts(false);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchStockMovements(params)
      .then((res) => {
        if (!alive) {
          return;
        }
        setTotal(res.total);
        setItems(res.items);
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
  }, [params]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const setFromDate = (value: string) => {
    if (value && to && new Date(value).getTime() > new Date(to).getTime()) {
      toast.error("From date cannot be after To date.");
      return;
    }

    setFrom(value);
    setPage(1);
  };

  const setToDate = (value: string) => {
    if (value && from && new Date(value).getTime() < new Date(from).getTime()) {
      toast.error("To date cannot be before From date.");
      return;
    }

    setTo(value);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exported: StockMovement[] = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        const response = await fetchStockMovements({
          product_id: selectedProductId || undefined,
          movement_type: type,
          from_date: from || undefined,
          to_date: to || undefined,
          page: currentPage,
          take: 100,
        });

        exported.push(...response.items);
        totalPages = Math.max(1, Math.ceil(response.total / response.take));
        currentPage += 1;
      } while (currentPage <= totalPages);

      const blob = new Blob([toCsv(exported)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "stock-movements.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export stock movements.");
    } finally {
      setExporting(false);
    }
  };

  const hasPreviousPage = page > 1;
  const hasNextPage = page * PAGE_SIZE < total;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-5">
          <div className="space-y-1">
            <Label>Product</Label>
            <Popover open={productFilterOpen} onOpenChange={setProductFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                  disabled={loadingProducts}
                >
                  <span className="truncate">
                    {loadingProducts ? "Loading products..." : selectedProduct?.name ?? "All products"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(92vw,26rem)] p-0">
                <Command>
                  <CommandInput placeholder="Search product..." />
                  <CommandList>
                    <CommandEmpty>No product found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all products"
                        onSelect={() => {
                          setSelectedProductId("");
                          setProductFilterOpen(false);
                          setPage(1);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${selectedProductId === "" ? "opacity-100" : "opacity-0"}`} />
                        All products
                      </CommandItem>
                      {products.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={`${product.name} ${product.sku}`}
                          onSelect={() => {
                            setSelectedProductId(product.id);
                            setProductFilterOpen(false);
                            setPage(1);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${selectedProductId === product.id ? "opacity-100" : "opacity-0"}`} />
                          <span className="truncate">{product.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{product.sku}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(value) => {
                setType(value);
                setPage(1);
              }}
            >
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
            <Label htmlFor="stock-movements-from-date">From</Label>
            <Input
              id="stock-movements-from-date"
              type="date"
              value={from}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stock-movements-to-date">To</Label>
            <Input
              id="stock-movements-to-date"
              type="date"
              value={to}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Actions</Label>
            <Button
              type="button"
              variant="outline"
              onClick={handleExport}
              disabled={exporting || loading || items.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
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
                        {movement.created_by_username ?? movement.created_by_user_id ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={loading || !hasPreviousPage}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Previous page
                </Button>
                <span className="text-sm text-muted-foreground">Page {page}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={loading || !hasNextPage}
                >
                  Next page
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
