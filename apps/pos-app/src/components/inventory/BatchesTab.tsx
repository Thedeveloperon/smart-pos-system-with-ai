import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import {
  createProductBatch,
  fetchProductBatches,
  fetchProductCatalogItems,
  fetchSuppliers,
  updateProductBatch,
  type CatalogProduct,
  type ProductBatch,
  type SupplierRecord,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import ExpiryBadge from "./ExpiryBadge";

type FormState = {
  batch_number: string;
  manufacture_date: string;
  expiry_date: string;
  initial_quantity: number;
  cost_price: number;
  supplier_id: string;
};

const empty: FormState = {
  batch_number: "",
  manufacture_date: "",
  expiry_date: "",
  initial_quantity: 0,
  cost_price: 0,
  supplier_id: "",
};

export default function BatchesTab() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productId, setProductId] = useState("");
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchProductCatalogItems(200, true)
      .then((items) => {
        if (!alive) return;
        setProducts(items);
        const first = items.find((item) => item.isBatchTracked) ?? items[0];
        if (first) {
          setProductId(first.id);
        }
      })
      .catch((error) => {
        if (alive) {
          toast.error(error instanceof Error ? error.message : "Failed to load products.");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!productId) return;
    let alive = true;
    setLoading(true);
    fetchProductBatches(productId)
      .then((items) => {
        if (alive) {
          setBatches(items);
        }
      })
      .catch((error) => {
        if (alive) {
          toast.error(error instanceof Error ? error.message : "Failed to load product batches.");
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
  }, [productId]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingSuppliers(true);
    fetchSuppliers(true)
      .then((items) => {
        if (alive) {
          setSuppliers(items);
        }
      })
      .catch((error) => {
        if (alive) {
          toast.error(error instanceof Error ? error.message : "Failed to load suppliers.");
        }
      })
      .finally(() => {
        if (alive) {
          setLoadingSuppliers(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const openCreate = () => {
    setEditingId(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (batch: ProductBatch) => {
    setEditingId(batch.id);
    setForm({
      batch_number: batch.batch_number,
      manufacture_date: batch.manufacture_date?.slice(0, 10) ?? "",
      expiry_date: batch.expiry_date?.slice(0, 10) ?? "",
      initial_quantity: batch.initial_quantity,
      cost_price: batch.cost_price,
      supplier_id: batch.supplier_id ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        batch_number: form.batch_number,
        manufacture_date: form.manufacture_date || undefined,
        expiry_date: form.expiry_date || undefined,
        initial_quantity: Number(form.initial_quantity),
        remaining_quantity: Number(form.initial_quantity),
        cost_price: Number(form.cost_price),
        supplier_id: form.supplier_id || undefined,
      };
      if (editingId) {
        await updateProductBatch(productId, editingId, payload);
      } else {
        await createProductBatch(productId, payload);
      }
      setBatches(await fetchProductBatches(productId));
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save product batch.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Product batches</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                Add batch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit batch" : "New batch"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label>Batch number</Label>
                  <Input
                    value={form.batch_number}
                    onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label>Manufacture date</Label>
                    <Input
                      type="date"
                      value={form.manufacture_date}
                      onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>Expiry date</Label>
                    <Input
                      type="date"
                      value={form.expiry_date}
                      onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label>Initial quantity</Label>
                    <Input
                      type="number"
                      value={form.initial_quantity}
                      onChange={(e) =>
                        setForm({ ...form, initial_quantity: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>Cost price</Label>
                    <Input
                      type="number"
                      value={form.cost_price}
                      onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label>Supplier</Label>
                  <Select
                    value={form.supplier_id}
                    onValueChange={(value) => setForm({ ...form, supplier_id: value })}
                  >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingSuppliers ? "Loading suppliers..." : "Select supplier"} />
                  </SelectTrigger>
                  <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving..." : "Save batch"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : batches.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Boxes className="mx-auto mb-2 h-8 w-8 opacity-50" />
            No batches for this product.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Manufacture</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Initial</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell className="font-mono text-xs">{batch.batch_number}</TableCell>
                  <TableCell>{batch.manufacture_date ? new Date(batch.manufacture_date).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>
                    <ExpiryBadge expiryDate={batch.expiry_date} />
                  </TableCell>
                  <TableCell className="text-right">{batch.initial_quantity}</TableCell>
                  <TableCell className="text-right">{batch.remaining_quantity}</TableCell>
                  <TableCell className="text-right">{batch.cost_price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(batch)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
