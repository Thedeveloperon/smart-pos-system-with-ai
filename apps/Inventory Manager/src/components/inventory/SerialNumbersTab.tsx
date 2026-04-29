import { useEffect, useState } from "react";
import {
  fetchProducts,
  fetchSerialNumbers,
  lookupSerial,
  updateSerialNumber,
  addSerialNumbers,
  type Product,
  type SerialLookupResult,
  type SerialNumberRecord,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import SerialInputList from "./SerialInputList";
import { Search, Hash } from "lucide-react";

const STATUS_TONES: Record<string, string> = {
  Available: "bg-green-100 text-green-800",
  Sold: "bg-blue-100 text-blue-800",
  Returned: "bg-amber-100 text-amber-800",
  Defective: "bg-red-100 text-red-800",
  UnderWarranty: "bg-purple-100 text-purple-800",
};

export default function SerialNumbersTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [serials, setSerials] = useState<SerialNumberRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [lookupValue, setLookupValue] = useState("");
  const [lookupResult, setLookupResult] = useState<SerialLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newSerials, setNewSerials] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProducts().then((p) => {
      setProducts(p);
      const firstSerialProduct = p.find((x) => x.is_serial_tracked) ?? p[0];
      if (firstSerialProduct) setProductId(firstSerialProduct.id);
    });
  }, []);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    fetchSerialNumbers(productId)
      .then(setSerials)
      .finally(() => setLoading(false));
  }, [productId]);

  const handleLookup = async () => {
    setLookupError(null);
    setLookupResult(null);
    if (!lookupValue.trim()) return;
    try {
      const r = await lookupSerial(lookupValue.trim());
      setLookupResult(r);
    } catch (e) {
      setLookupError((e as Error).message);
    }
  };

  const handleMarkDefective = async (sid: string) => {
    const updated = await updateSerialNumber(productId, sid, { status: "Defective" });
    setSerials((prev) => prev.map((s) => (s.id === sid ? updated : s)));
  };

  const handleAdd = async () => {
    if (!productId || newSerials.length === 0) return;
    setSaving(true);
    try {
      const added = await addSerialNumbers(productId, newSerials);
      setSerials((prev) => [...prev, ...added]);
      setNewSerials([]);
      setAddOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" /> Serial lookup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter a serial number…"
              value={lookupValue}
              onChange={(e) => setLookupValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            />
            <Button onClick={handleLookup}>Look up</Button>
          </div>
          {lookupError && (
            <p className="text-sm text-destructive">{lookupError}</p>
          )}
          {lookupResult && (
            <div className="rounded-md border p-3 grid gap-1 text-sm">
              <div>
                <span className="text-muted-foreground">Serial:</span>{" "}
                <span className="font-mono">{lookupResult.serial_value}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Product:</span>{" "}
                {lookupResult.product_name}
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge className={STATUS_TONES[lookupResult.status] ?? ""}>
                  {lookupResult.status}
                </Badge>
              </div>
              {lookupResult.sale_date && (
                <div>
                  <span className="text-muted-foreground">Sold:</span>{" "}
                  {new Date(lookupResult.sale_date).toLocaleDateString()}
                </div>
              )}
              {lookupResult.warranty_expiry_date && (
                <div>
                  <span className="text-muted-foreground">Warranty until:</span>{" "}
                  {new Date(lookupResult.warranty_expiry_date).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Serials by product</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">Add serials</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add serial numbers</DialogTitle>
                </DialogHeader>
                <SerialInputList value={newSerials} onChange={setNewSerials} />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAdd} disabled={saving || newSerials.length === 0}>
                    {saving ? "Saving…" : `Add ${newSerials.length}`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : serials.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Hash className="mx-auto h-8 w-8 mb-2 opacity-50" />
              No serials recorded for this product yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serials.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">{s.serial_value}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONES[s.status] ?? ""}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {s.warranty_expiry_date
                        ? new Date(s.warranty_expiry_date).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.status !== "Defective" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkDefective(s.id)}
                        >
                          Mark defective
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
