import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createProductBatch,
  fetchProductBatches,
  fetchProducts,
  updateProductBatch,
  type Product,
  type ProductBatch,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import ExpiryBadge from "./ExpiryBadge";
import { Boxes } from "lucide-react";

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
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchProducts()
      .then((p) => {
        if (!alive) return;
        setProducts(p);
        const first = p.find((x) => x.is_batch_tracked) ?? p[0];
        if (first) setProductId(first.id);
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

  const openCreate = () => {
    setEditingId(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (b: ProductBatch) => {
    setEditingId(b.id);
    setForm({
      batch_number: b.batch_number,
      manufacture_date: b.manufacture_date?.slice(0, 10) ?? "",
      expiry_date: b.expiry_date?.slice(0, 10) ?? "",
      initial_quantity: b.initial_quantity,
      cost_price: b.cost_price,
      supplier_id: b.supplier_id ?? "",
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
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
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
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.initial_quantity}
                      onChange={(e) =>
                        setForm({ ...form, initial_quantity: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>Cost price</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.cost_price}
                      onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label>Supplier</Label>
                  <Select
                    value={form.supplier_id || "none"}
                    onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No supplier</SelectItem>
                      <SelectItem value="sup-1">Acme Distributors</SelectItem>
                      <SelectItem value="sup-2">MedSupply Co.</SelectItem>
                      <SelectItem value="sup-3">TechWholesale Ltd</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving || !form.batch_number}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create batch"}
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
        ) : batches.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Boxes className="mx-auto h-8 w-8 mb-2 opacity-50" />
            No batches recorded for this product.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Mfg</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Initial</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.batch_number}</TableCell>
                  <TableCell>{new Date(b.received_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {b.manufacture_date ? new Date(b.manufacture_date).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">{b.initial_quantity}</TableCell>
                  <TableCell className="text-right">{b.remaining_quantity}</TableCell>
                  <TableCell className="text-right">${b.cost_price.toFixed(2)}</TableCell>
                  <TableCell>
                    <ExpiryBadge expiryDate={b.expiry_date} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>
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
