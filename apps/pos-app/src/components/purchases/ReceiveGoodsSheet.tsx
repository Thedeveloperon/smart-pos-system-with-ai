import { Fragment as FragmentWithKey, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  is_serial_tracked: boolean;
  serials: string[];
  is_batch_tracked: boolean;
  batch_number: string;
  expiry_date: string;
  manufacture_date: string;
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
  const [serialDialogLineIndex, setSerialDialogLineIndex] = useState<number | null>(null);
  const [pendingSubmitAfterSerials, setPendingSubmitAfterSerials] = useState(false);

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
    setSerialDialogLineIndex(null);
    setPendingSubmitAfterSerials(false);
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
            is_serial_tracked: Boolean(p?.isSerialTracked ?? p?.is_serial_tracked),
            serials: [],
            is_batch_tracked: !!p?.is_batch_tracked,
            batch_number: "",
            expiry_date: "",
            manufacture_date: "",
          };
        }),
    );
  }, [open, po, products]);

  const update = (idx: number, patch: Partial<ReceiveLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const getExpectedSerialCount = (line: ReceiveLine) => Math.max(0, Math.trunc(line.quantity_receiving));

  const hasCompleteSerials = (line: ReceiveLine) =>
    line.is_serial_tracked && line.serials.length === getExpectedSerialCount(line);

  const serialDialogLine =
    serialDialogLineIndex === null ? null : (lines[serialDialogLineIndex] ?? null);

  const openSerialDialog = (lineIndex: number, continueSubmission = false) => {
    setSerialDialogLineIndex(lineIndex);
    setPendingSubmitAfterSerials(continueSubmission);
  };

  const closeSerialDialog = () => {
    setSerialDialogLineIndex(null);
    setPendingSubmitAfterSerials(false);
  };

  const validateBeforeSubmit = () => {
    if (!invoiceNumber) {
      toast.error("Invoice number is required.");
      return false;
    }

    if (lines.some((l) => l.quantity_receiving <= 0)) {
      toast.error("All receiving quantities must be greater than zero.");
      return false;
    }

    const fractionalSerialLine = lines.find(
      (line) => line.is_serial_tracked && !Number.isInteger(line.quantity_receiving),
    );
    if (fractionalSerialLine) {
      toast.error(
        `'${fractionalSerialLine.product_name}' must be received in whole units before adding serial numbers.`,
      );
      return false;
    }

    return true;
  };

  const submitReceipt = async () => {
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
          serials: l.serials,
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

  const handleConfirm = async () => {
    if (!validateBeforeSubmit()) {
      return;
    }

    const missingSerialLineIndex = lines.findIndex(
      (line) => line.is_serial_tracked && !hasCompleteSerials(line),
    );

    if (missingSerialLineIndex >= 0) {
      openSerialDialog(missingSerialLineIndex, true);
      return;
    }

    await submitReceipt();
  };

  const handleSerialDialogSave = async () => {
    if (!serialDialogLine) {
      return;
    }

    const expectedSerialCount = getExpectedSerialCount(serialDialogLine);
    if (serialDialogLine.serials.length !== expectedSerialCount) {
      toast.error(
        `'${serialDialogLine.product_name}' requires exactly ${expectedSerialCount} serial number(s) for this receipt.`,
      );
      return;
    }

    if (!pendingSubmitAfterSerials) {
      closeSerialDialog();
      return;
    }

    const nextMissingSerialLineIndex = lines.findIndex(
      (line, index) =>
        index !== serialDialogLineIndex && line.is_serial_tracked && !hasCompleteSerials(line),
    );

    if (nextMissingSerialLineIndex >= 0) {
      setSerialDialogLineIndex(nextMissingSerialLineIndex);
      return;
    }

    closeSerialDialog();
    await submitReceipt();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Receive Goods · {po.po_number}</SheetTitle>
            <SheetDescription>
              Confirm the quantities you are receiving and provide serial or batch details where
              required.
            </SheetDescription>
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
                            onChange={(e) =>
                              update(idx, { unit_cost: Number(e.target.value) || 0 })
                            }
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
                            <div className="space-y-3">
                              {l.is_serial_tracked && (
                                <div className="flex flex-col gap-3 rounded-lg border bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="space-y-1">
                                    <div className="text-sm font-medium">Serial numbers</div>
                                    <div className="text-xs text-muted-foreground">
                                      Enter exactly {getExpectedSerialCount(l)} serial number(s) for
                                      this receipt.
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={hasCompleteSerials(l) ? "default" : "secondary"}
                                    >
                                      {l.serials.length} / {getExpectedSerialCount(l)}
                                    </Badge>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openSerialDialog(idx)}
                                    >
                                      {l.serials.length > 0 ? "Edit serials" : "Add serials"}
                                    </Button>
                                  </div>
                                </div>
                              )}
                              {l.is_batch_tracked && (
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <Label className="text-xs">Batch #</Label>
                                    <Input
                                      value={l.batch_number}
                                      onChange={(e) =>
                                        update(idx, { batch_number: e.target.value })
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Manufacture Date</Label>
                                    <Input
                                      type="date"
                                      value={l.manufacture_date}
                                      onChange={(e) =>
                                        update(idx, { manufacture_date: e.target.value })
                                      }
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

      <Dialog
        open={serialDialogLine !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeSerialDialog();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add serial numbers</DialogTitle>
            <DialogDescription>
              {serialDialogLine
                ? `Enter exactly ${getExpectedSerialCount(serialDialogLine)} serial number(s) for ${serialDialogLine.product_name}.`
                : "Paste serials or generate a range."}
            </DialogDescription>
          </DialogHeader>
          {serialDialogLine && (
            <SerialInputList
              value={serialDialogLine.serials}
              onChange={(serials) => update(serialDialogLineIndex, { serials })}
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeSerialDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSerialDialogSave}
              disabled={
                !serialDialogLine ||
                serialDialogLine.serials.length !== getExpectedSerialCount(serialDialogLine)
              }
            >
              Save serials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
