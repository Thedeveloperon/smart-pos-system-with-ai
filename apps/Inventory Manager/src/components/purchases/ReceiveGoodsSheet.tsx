import { Fragment as FragmentWithKey, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SerialInputList from "@/components/inventory/SerialInputList";
import { fetchProducts, type Product } from "@/lib/api";
import { receivePurchaseOrder, type PurchaseOrder } from "@/lib/purchases";
import { fmtCurrency, todayIso } from "./utils";

type ReceiveLine = {
  product_id: string;
  product_name: string;
  quantity_ordered: number;
  quantity_already_received: number;
  quantity_remaining: number;
  quantity_receiving: number;
  unit_cost: number;
  is_batch_tracked: boolean;
  is_serial_tracked: boolean;
  batch_number: string;
  expiry_date: string;
  manufacture_date: string;
  serials: string[];
};

type Props = {
  open: boolean;
  po: PurchaseOrder;
  onClose: () => void;
  onReceived: () => void;
};

export default function ReceiveGoodsSheet({ open, po, onClose, onReceived }: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [updateCostPrice, setUpdateCostPrice] = useState(true);
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!open) return;
    fetchProducts().then(setProducts);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setInvoiceNumber("");
    setInvoiceDate(todayIso());
    setNotes("");
    setUpdateCostPrice(true);
    setLines(
      po.lines
        .filter((l) => l.quantity_pending > 0)
        .map((l) => {
          const p = products.find((x) => x.id === l.product_id);
          return {
            product_id: l.product_id,
            product_name: l.product_name,
            quantity_ordered: l.quantity_ordered,
            quantity_already_received: l.quantity_received,
            quantity_remaining: l.quantity_pending,
            quantity_receiving: l.quantity_pending,
            unit_cost: l.unit_cost_estimate,
            is_batch_tracked: !!p?.is_batch_tracked,
            is_serial_tracked: !!p?.is_serial_tracked,
            batch_number: "",
            expiry_date: "",
            manufacture_date: "",
            serials: [],
          };
        }),
    );
  }, [open, po, products]);

  const update = (idx: number, patch: Partial<ReceiveLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleConfirm = async () => {
    if (!invoiceNumber) {
      toast.error("Invoice number is required.");
      return;
    }
    if (lines.some((l) => l.quantity_receiving <= 0)) {
      toast.error("All receiving quantities must be greater than zero.");
      return;
    }
    const invalidSerialLine = lines.find((line) => {
      if (!line.is_serial_tracked) {
        return false;
      }

      if (!Number.isInteger(line.quantity_receiving)) {
        return true;
      }

      return line.serials.length !== line.quantity_receiving;
    });
    if (invalidSerialLine) {
      if (!Number.isInteger(invalidSerialLine.quantity_receiving)) {
        toast.error(`${invalidSerialLine.product_name} must use a whole-number receiving quantity.`);
        return;
      }

      toast.error(
        `${invalidSerialLine.product_name} requires ${invalidSerialLine.quantity_receiving} serial number(s).`,
      );
      return;
    }
    setSaving(true);
    try {
      await receivePurchaseOrder(po.id, {
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        notes: notes || undefined,
        update_cost_price: updateCostPrice,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          quantity_received: l.quantity_receiving,
          unit_cost: l.unit_cost,
          batch_number: l.batch_number || undefined,
          expiry_date: l.expiry_date || undefined,
          manufacture_date: l.manufacture_date || undefined,
          serials: l.is_serial_tracked ? l.serials : undefined,
        })),
      });
      toast.success("Goods received and stock updated.");
      onReceived();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to receive goods.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Receive Goods · {po.po_number}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Invoice Number</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-..."
              />
            </div>
            <div>
              <Label>Invoice Date</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center justify-between border rounded p-3">
            <div>
              <div className="font-medium text-sm">Update product cost price</div>
              <div className="text-xs text-muted-foreground">
                Use received unit costs to refresh product cost.
              </div>
            </div>
            <Switch checked={updateCostPrice} onCheckedChange={setUpdateCostPrice} />
          </div>

          <Separator />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="w-28">Receiving Now</TableHead>
                <TableHead className="w-28">Unit Cost</TableHead>
                <TableHead>Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, idx) => {
                const variance = l.quantity_receiving - l.quantity_remaining;
                return (
                  <FragmentWithKey key={`${l.product_id}-${idx}`}>
                    <TableRow>
                      <TableCell className="font-medium">{l.product_name}</TableCell>
                      <TableCell className="text-right">{l.quantity_ordered}</TableCell>
                      <TableCell className="text-right">{l.quantity_already_received}</TableCell>
                      <TableCell className="text-right text-amber-700">
                        {l.quantity_remaining}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={l.quantity_receiving}
                          onChange={(e) =>
                            update(idx, { quantity_receiving: Number(e.target.value) || 0 })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.unit_cost}
                          onChange={(e) => update(idx, { unit_cost: Number(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        {variance === 0 ? (
                          <span className="inline-flex items-center text-green-700 text-sm">
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Match
                          </span>
                        ) : variance > 0 ? (
                          <span className="text-red-700 text-sm">+{variance} over</span>
                        ) : (
                          <span className="text-amber-700 text-sm">{variance} partial</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {(l.is_batch_tracked || l.is_serial_tracked) && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={7}>
                          <div className="space-y-4">
                            {l.is_batch_tracked && (
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <Label className="text-xs">Batch #</Label>
                                  <Input
                                    value={l.batch_number}
                                    onChange={(e) => update(idx, { batch_number: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Manufacture Date</Label>
                                  <Input
                                    type="date"
                                    value={l.manufacture_date}
                                    onChange={(e) => update(idx, { manufacture_date: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Expiry Date</Label>
                                  <Input
                                    type="date"
                                    value={l.expiry_date}
                                    onChange={(e) => update(idx, { expiry_date: e.target.value })}
                                  />
                                </div>
                              </div>
                            )}

                            {l.is_serial_tracked && (
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <Label className="text-xs">Serial numbers</Label>
                                    <p className="text-xs text-muted-foreground">
                                      Enter one serial per received unit before confirming the receipt.
                                    </p>
                                  </div>
                                  <p
                                    className={`text-xs font-medium ${
                                      Number.isInteger(l.quantity_receiving) &&
                                      l.serials.length === l.quantity_receiving
                                        ? "text-green-700"
                                        : "text-amber-700"
                                    }`}
                                  >
                                    {l.serials.length}/{l.quantity_receiving} entered
                                  </p>
                                </div>
                                <SerialInputList
                                  value={l.serials}
                                  onChange={(serials) => update(idx, { serials })}
                                />
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </FragmentWithKey>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <SheetFooter className="border-t pt-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Receipt total: </span>
              <span className="font-semibold">
                {fmtCurrency(lines.reduce((s, l) => s + l.quantity_receiving * l.unit_cost, 0))}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? "Saving..." : "Confirm Receipt & Update Stock"}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
