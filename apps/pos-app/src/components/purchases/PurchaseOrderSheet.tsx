import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { fetchProducts, fetchSuppliers, type Product, type Supplier } from "@/lib/api";
import { createPurchaseOrder, updatePurchaseOrder, type PurchaseOrder } from "@/lib/purchases";
import { fmtCurrency, todayIso } from "./utils";

type LineItem = {
  product_id: string;
  product_name: string;
  quantity_ordered: number;
  unit_cost_estimate: number;
};

type Props = {
  open: boolean;
  mode: "create" | "edit" | "view";
  po?: PurchaseOrder;
  onClose: () => void;
  onSaved: () => void;
};

export default function PurchaseOrderSheet({ open, mode, po, onClose, onSaved }: Props) {
  const [supplierId, setSupplierId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState(todayIso());
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const readOnly = mode === "view";

  useEffect(() => {
    if (!open) return;
    Promise.all([fetchSuppliers(), fetchProducts()]).then(([s, p]) => {
      setSuppliers(s);
      setProducts(p);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (po && (mode === "edit" || mode === "view")) {
      setSupplierId(po.supplier_id);
      setPoNumber(po.po_number);
      setPoDate(po.po_date.slice(0, 10));
      setExpectedDelivery(po.expected_delivery_date?.slice(0, 10) ?? "");
      setNotes(po.notes ?? "");
      setLines(
        po.lines.map((l) => ({
          product_id: l.product_id,
          product_name: l.product_name,
          quantity_ordered: l.quantity_ordered,
          unit_cost_estimate: l.unit_cost_estimate,
        })),
      );
    } else {
      setSupplierId("");
      setPoNumber(`PO-${Date.now().toString().slice(-6)}`);
      setPoDate(todayIso());
      setExpectedDelivery("");
      setNotes("");
      setLines([]);
    }
  }, [open, po, mode]);

  const subtotal = lines.reduce((s, l) => s + l.quantity_ordered * l.unit_cost_estimate, 0);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { product_id: "", product_name: "", quantity_ordered: 1, unit_cost_estimate: 0 },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const setLineProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    updateLine(idx, {
      product_id: productId,
      product_name: p?.name ?? "",
      unit_cost_estimate:
        lines[idx].unit_cost_estimate || (p ? Math.round(p.price * 0.6 * 100) / 100 : 0),
    });
  };

  const handleSave = async () => {
    if (!supplierId || !poNumber || lines.length === 0) {
      toast.error("Supplier, PO number, and at least one line are required.");
      return;
    }
    if (lines.some((l) => !l.product_id || l.quantity_ordered <= 0)) {
      toast.error("Each line needs a product and a positive quantity.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        await createPurchaseOrder({
          supplier_id: supplierId,
          po_number: poNumber,
          po_date: poDate,
          expected_delivery_date: expectedDelivery || undefined,
          notes: notes || undefined,
          lines: lines.map((l) => ({
            product_id: l.product_id,
            quantity_ordered: l.quantity_ordered,
            unit_cost_estimate: l.unit_cost_estimate,
          })),
        });
        toast.success("Purchase order created.");
      } else if (mode === "edit" && po) {
        await updatePurchaseOrder(po.id, {
          supplier_id: supplierId,
          po_number: poNumber,
          expected_delivery_date: expectedDelivery || undefined,
          notes: notes || undefined,
          lines: lines.map((l) => ({
            product_id: l.product_id,
            quantity_ordered: l.quantity_ordered,
            unit_cost_estimate: l.unit_cost_estimate,
          })),
        });
        toast.success("Purchase order updated.");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save purchase order.");
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === "create"
      ? "New Purchase Order"
      : mode === "edit"
        ? `Edit ${poNumber}`
        : `PO ${poNumber}`;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId} disabled={readOnly}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.supplier_id} value={s.supplier_id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>PO Number</Label>
              <Input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>PO Date</Label>
              <Input
                type="date"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <Label>Expected Delivery</Label>
              <Input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={readOnly}
              rows={2}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Line Items</h3>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Product
              </Button>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="w-24">Qty</TableHead>
                <TableHead className="w-32">Unit Cost</TableHead>
                <TableHead className="w-32 text-right">Total</TableHead>
                {!readOnly && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={readOnly ? 4 : 5}
                    className="text-center text-muted-foreground py-4"
                  >
                    No line items.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((l, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {readOnly ? (
                        l.product_name
                      ) : (
                        <Select value={l.product_id} onValueChange={(v) => setLineProduct(idx, v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} <span className="text-muted-foreground">({p.sku})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={l.quantity_ordered}
                        onChange={(e) =>
                          updateLine(idx, { quantity_ordered: Number(e.target.value) || 0 })
                        }
                        disabled={readOnly}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.unit_cost_estimate}
                        onChange={(e) =>
                          updateLine(idx, { unit_cost_estimate: Number(e.target.value) || 0 })
                        }
                        disabled={readOnly}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fmtCurrency(l.quantity_ordered * l.unit_cost_estimate)}
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {readOnly && po && po.bills.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2">Linked Bills</h3>
                <ul className="space-y-1 text-sm">
                  {po.bills.map((b) => (
                    <li key={b.id} className="flex justify-between border rounded p-2">
                      <span>
                        {b.invoice_number}{" "}
                        <span className="text-muted-foreground">· {b.source_type}</span>
                      </span>
                      <span className="font-medium">{fmtCurrency(b.grand_total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="border-t pt-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Subtotal: </span>
              <span className="font-semibold text-base">{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                {readOnly ? "Close" : "Cancel"}
              </Button>
              {!readOnly && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Draft"}
                </Button>
              )}
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
