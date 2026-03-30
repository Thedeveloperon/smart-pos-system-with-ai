import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw, ReceiptText, ShieldCheck } from "lucide-react";
import { createRefund, fetchReceipt, fetchSaleRefundSummary, type RefundResponse, type SaleReceiptResponse, type SaleRefundSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type RefundSaleDialogProps = {
  open: boolean;
  saleId: string | null;
  onOpenChange: (open: boolean) => void;
  onRefunded?: (refund: RefundResponse) => Promise<void> | void;
};

type RefundQuantityMap = Record<string, string>;

const money = (value: number) => `Rs. ${value.toLocaleString()}`;

const getRefundableUnitAmount = (item: SaleReceiptResponse["items"][number]) => {
  if (item.quantity <= 0) {
    return 0;
  }

  return item.line_total / item.quantity;
};

const getInitialQuantities = (summary: SaleRefundSummary | null) => {
  const initial: RefundQuantityMap = {};
  for (const item of summary?.items || []) {
    initial[item.sale_item_id] = item.refundable_quantity > 0 ? String(item.refundable_quantity) : "0";
  }
  return initial;
};

const RefundSaleDialog = ({ open, saleId, onOpenChange, onRefunded }: RefundSaleDialogProps) => {
  const [receipt, setReceipt] = useState<SaleReceiptResponse | null>(null);
  const [summary, setSummary] = useState<SaleRefundSummary | null>(null);
  const [quantities, setQuantities] = useState<RefundQuantityMap>({});
  const [reason, setReason] = useState("customer_request");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !saleId) {
      return;
    }

    let alive = true;

    const loadRefundData = async () => {
      setLoading(true);
      try {
        const [saleReceipt, refundSummary] = await Promise.all([
          fetchReceipt(saleId),
          fetchSaleRefundSummary(saleId),
        ]);

        if (!alive) {
          return;
        }

        setReceipt(saleReceipt);
        setSummary(refundSummary);
        setQuantities(getInitialQuantities(refundSummary));
        setReason("customer_request");
      } catch (error) {
        if (!alive) {
          return;
        }

        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to load refund details.");
        onOpenChange(false);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void loadRefundData();

    return () => {
      alive = false;
    };
  }, [open, onOpenChange, saleId]);

  const editableItems = useMemo(() => {
    if (!receipt || !summary) {
      return [];
    }

    return receipt.items.map((receiptItem) => {
      const summaryItem = summary.items.find((item) => item.sale_item_id === receiptItem.sale_item_id);
      return {
        receiptItem,
        summaryItem,
        refundableUnitAmount: getRefundableUnitAmount(receiptItem),
      };
    });
  }, [receipt, summary]);

  const selectedRefundItems = useMemo(() => {
    if (!summary || !receipt) {
      return [];
    }

    return editableItems
      .map(({ receiptItem, summaryItem, refundableUnitAmount }) => {
        if (!summaryItem) {
          return null;
        }

        const quantity = Number(quantities[receiptItem.sale_item_id] || "0");
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return null;
        }

        const safeQuantity = Math.min(quantity, summaryItem.refundable_quantity);
        if (safeQuantity <= 0) {
          return null;
        }

        return {
          sale_item_id: receiptItem.sale_item_id,
          product_name: receiptItem.product_name,
          quantity: safeQuantity,
          estimated_total: Number((safeQuantity * refundableUnitAmount).toFixed(2)),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [editableItems, quantities, receipt, summary]);

  const estimatedRefundTotal = useMemo(() => {
    return selectedRefundItems.reduce((acc, item) => acc + item.estimated_total, 0);
  }, [selectedRefundItems]);

  const handleQuantityChange = (saleItemId: string, value: string, max: number) => {
    const normalized = value === "" ? "" : String(Math.max(0, Math.min(Number(value) || 0, max)));
    setQuantities((current) => ({ ...current, [saleItemId]: normalized }));
  };

  const handleSubmit = async () => {
    if (!saleId || !summary || !receipt) {
      return;
    }

    if (selectedRefundItems.length === 0) {
      toast.error("Select at least one item to refund.");
      return;
    }

    const reasonText = reason.trim();
    if (!reasonText) {
      toast.error("Please add a refund reason.");
      return;
    }

    setSubmitting(true);
    try {
      const refund = await createRefund({
        sale_id: saleId,
        reason: reasonText,
        items: selectedRefundItems.map((item) => ({
          sale_item_id: item.sale_item_id,
          quantity: item.quantity,
        })),
      });

      toast.success(`Refund ${refund.refund_number} created for ${money(refund.grand_total)}.`);
      await onRefunded?.(refund);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to create refund.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = selectedRefundItems.length > 0 && !submitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden border-border/70 bg-background p-0 shadow-2xl">
        <div className="border-b border-border/70 bg-pos-header px-6 py-5 text-pos-header-foreground">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
              <RotateCcw className="h-5 w-5 text-primary" />
              Create Refund
            </DialogTitle>
            <DialogDescription className="text-pos-header-foreground/70">
              Refund paid sales from the history view. Quantities can be partial and will follow the
              remaining refundable balance from the backend.
            </DialogDescription>
          </DialogHeader>
        </div>

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading refund details...
          </div>
        ) : !receipt || !summary ? null : (
          <div className="grid max-h-[calc(92vh-88px)] gap-6 overflow-hidden px-6 py-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-4 overflow-hidden">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sale</div>
                  <div className="mt-1 text-lg font-semibold">{summary.sale_number}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Status: <span className="capitalize">{summary.sale_status}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Refunded</div>
                  <div className="mt-1 text-lg font-semibold">{money(summary.refunded_total)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Tax reversed {money(summary.refunded_tax_total)}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Remaining</div>
                  <div className="mt-1 text-lg font-semibold">{money(summary.remaining_refundable_total)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Available to refund</div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ReceiptText className="h-4 w-4 text-primary" />
                    Refundable Items
                  </div>
                  <Badge variant="secondary">{editableItems.length}</Badge>
                </div>

                <ScrollArea className="max-h-[42vh]">
                  <div className="divide-y divide-border">
                    {editableItems.map(({ receiptItem, summaryItem }) => {
                      const maxQuantity = summaryItem?.refundable_quantity || 0;
                      const currentValue = quantities[receiptItem.sale_item_id] ?? String(maxQuantity);
                      const currentQuantity = Number(currentValue) || 0;
                      const estimatedLineTotal = currentQuantity * getRefundableUnitAmount(receiptItem);

                      return (
                        <div key={receiptItem.sale_item_id} className="space-y-3 px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">{receiptItem.product_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Sold {summaryItem?.sold_quantity ?? 0} · Refunded {summaryItem?.refunded_quantity ?? 0} ·
                                Refundable {maxQuantity}
                              </p>
                            </div>
                            <div className="text-right text-sm">
                              <div className="font-semibold">{money(estimatedLineTotal)}</div>
                              <div className="text-xs text-muted-foreground">
                                Unit {money(getRefundableUnitAmount(receiptItem))}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                            <div className="rounded-xl border border-border bg-background px-3 py-2">
                              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Refund Qty</div>
                              <Input
                                type="number"
                                min="0"
                                max={maxQuantity}
                                step="0.001"
                                value={currentValue}
                                onChange={(event) =>
                                  handleQuantityChange(
                                    receiptItem.sale_item_id,
                                    event.target.value,
                                    maxQuantity
                                  )
                                }
                                disabled={maxQuantity <= 0}
                                className="mt-2 h-10 text-base font-semibold"
                              />
                            </div>
                            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</div>
                              <div className="mt-2 text-sm font-medium">
                                {maxQuantity > 0 ? "Refundable" : "Fully refunded"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Refund Summary
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Estimated refund</span>
                    <span className="font-semibold">{money(estimatedRefundTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Items selected</span>
                    <span className="font-semibold">{selectedRefundItems.length}</span>
                  </div>
                  <Separator />
                  <div className="rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
                    The backend will validate the exact refundable quantities, allocate payment reversals,
                    and update inventory and audit logs atomically.
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="space-y-2">
                  <Label htmlFor="refund-reason">Reason</Label>
                  <Input
                    id="refund-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="customer_request"
                  />
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">Refund impact</p>
                      <p className="text-amber-900/80">
                        This will restore stock, create reversing payment entries, and mark the sale as
                        partially or fully refunded.
                      </p>
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Process Refund
                  </Button>
                </DialogFooter>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RefundSaleDialog;
