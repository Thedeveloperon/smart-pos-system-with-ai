import { Fragment as FragmentWithKey, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
  createManualBill,
  fetchProducts,
  fetchPurchaseOrders,
  fetchSuppliers,
  type Product,
  type PurchaseOrder,
  type Supplier,
} from "@/lib/purchases";
import { fmtCurrency, todayIso } from "./utils";

type ManualBillLine = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  is_batch_tracked: boolean;
  batch_number: string;
  expiry_date: string;
  manufacture_date: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function ManualBillDialog({ open, onClose, onSaved }: Props) {
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [poId, setPoId] = useState("");
  const [notes, setNotes] = useState("");
  const [updateCostPrice, setUpdateCostPrice] = useState(true);
  const [lines, setLines] = useState<ManualBillLine[]>([]);
  const [openPOs, setOpenPOs] = useState<PurchaseOrder[]>([]);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!open) return;
    Promise.all([fetchSuppliers(), fetchProducts()]).then(([s, p]) => {
      setSuppliers(s);
      setProducts(p);
    });
    setSupplierId("");
    setInvoiceNumber("");
    setInvoiceDate(todayIso());
    setPoId("");
    setNotes("");
    setLines([]);
    setOpenPOs([]);
  }, [open]);

  useEffect(() => {
    if (!supplierId) { setOpenPOs([]); return; }
    Promise.all([
      fetchPurchaseOrders({ supplier_id: supplierId, status: "Sent" }),
      fetchPurchaseOrders({ supplier_id: supplierId, status: "PartiallyReceived" }),
    ]).then(([a, b]) => setOpenPOs([...a, ...b]));
  }, [supplierId]);

  const handlePoSelect = (id: string) => {
    setPoId(id);
    if (id === "none") { setLines([]); return; }
    const po = openPOs.find((p) => p.id === id);
    if (!po) return;
    setLines(
      po.lines
        .filter((l) => l.quantity_pending > 0)
        .map((l) => {
          const p = products.find((x) => x.id === l.product_id);
          return {
            product_id: l.product_id,
            product_name: l.product_name,
            quantity: l.quantity_pending,
            unit_cost: l.unit_cost_estimate,
            is_batch_tracked: !!p?.is_batch_tracked,
            batch_number: "",
            expiry_date: "",
            manufacture_date: "",
          };
        }),
    );
  };

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { product_id: "", product_name: "", quantity: 1, unit_cost: 0, is_batch_tracked: false, batch_number: "", expiry_date: "", manufacture_date: "" },
    ]);

  const update = (idx: number, patch: Partial<ManualBillLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const setLineProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    update(idx, {
      product_id: productId,
      product_name: p?.name ?? "",
      is_batch_tracked: !!p?.is_batch_tracked,
    });
  };

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);

  const handleSave = async () => {
    if (!supplierId || !invoiceNumber || lines.length === 0) {
      toast.error("Supplier, invoice number, and at least one line are required.");
      return;
    }
    if (lines.some((l) => !l.product_id || l.quantity <= 0)) {
      toast.error("Each line needs a product and a positive quantity.");
      return;
    }
    setSaving(true);
    try {
      await createManualBill({
        supplier_id: supplierId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        purchase_order_id: poId && poId !== "none" ? poId : undefined,
        update_cost_price: updateCostPrice,
        notes: notes || undefined,
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_number: l.batch_number || undefined,
          expiry_date: l.expiry_date || undefined,
          manufacture_date: l.manufacture_date || undefined,
        })),
      });
      toast.success("Bill recorded and stock updated.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save bill.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Supplier Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Invoice Number</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <Label>Invoice Date</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label>Link to PO (optional)</Label>
              <Select value={poId} onValueChange={handlePoSelect} disabled={!supplierId || openPOs.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={supplierId ? (openPOs.length ? "Select PO" : "No open POs") : "Select supplier first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {openPOs.map((p) => (<SelectItem key={p.id} value={p.id}>{p.po_number}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between border rounded p-3">
            <div className="text-sm font-medium">Update product cost price</div>
            <Switch checked={updateCostPrice} onCheckedChange={setUpdateCostPrice} />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Line Items</h3>
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Product
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="w-24">Qty</TableHead>
                <TableHead className="w-28">Unit Cost</TableHead>
                <TableHead className="w-28 text-right">Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                    No line items.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((l, idx) => (
                  <FragmentWithKey key={idx}>
                    <TableRow>
                      <TableCell>
                        <Select value={l.product_id} onValueChange={(v) => setLineProduct(idx, v)}>
                          <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={1} value={l.quantity}
                          onChange={(e) => update(idx, { quantity: Number(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" min={0} value={l.unit_cost}
                          onChange={(e) => update(idx, { unit_cost: Number(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtCurrency(l.quantity * l.unit_cost)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {l.is_batch_tracked && l.product_id && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={5}>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label className="text-xs">Batch #</Label>
                              <Input value={l.batch_number} onChange={(e) => update(idx, { batch_number: e.target.value })} />
                            </div>
                            <div>
                              <Label className="text-xs">Manufacture</Label>
                              <Input type="date" value={l.manufacture_date} onChange={(e) => update(idx, { manufacture_date: e.target.value })} />
                            </div>
                            <div>
                              <Label className="text-xs">Expiry</Label>
                              <Input type="date" value={l.expiry_date} onChange={(e) => update(idx, { expiry_date: e.target.value })} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </FragmentWithKey>
                ))
              )}
            </TableBody>
          </Table>

          <div className="border-t pt-3 flex justify-end text-sm">
            <div className="w-64 space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmtCurrency(subtotal)}</span></div>
              <div className="flex justify-between font-semibold text-base"><span>Grand Total</span><span>{fmtCurrency(subtotal)}</span></div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save & Update Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
