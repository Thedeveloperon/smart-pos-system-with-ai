import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, ReceiptText, X } from "lucide-react";
import { createRefund, fetchReceipt, fetchSaleRefundSummary, type RefundResponse, type SaleReceiptResponse, type SaleRefundSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RefundSaleDialogProps = {
  open: boolean;
  saleId: string | null;
  onOpenChange: (open: boolean) => void;
  onRefunded?: (refund: RefundResponse) => Promise<void> | void;
};

type RefundQuantityMap = Record<string, string>;

const money = (value: number) => `Rs. ${value.toLocaleString()}`;

const refundReasonOptions = [
  { value: "customer_request", label: "Customer request" },
  { value: "damaged_item", label: "Damaged item" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "duplicate_charge", label: "Duplicate charge" },
  { value: "other", label: "Other" },
] as const;

const getRefundReasonLabel = (value: string) =>
  refundReasonOptions.find((option) => option.value === value)?.label ?? "Customer request";

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
  const [reason, setReason] = useState(refundReasonOptions[0].value);
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
        setReason(refundReasonOptions[0].value);
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
      <DialogContent
        hideClose
        className="flex max-h-[calc(100dvh-1rem)] w-[min(96vw,72rem)] flex-col overflow-hidden border-border/50 bg-background p-0 shadow-xl"
      >
        <div className="relative border-b border-border/50 bg-pos-header px-4 py-4 pr-14 text-pos-header-foreground sm:px-5 sm:py-4">
          <DialogClose
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-pos-header-foreground/80 transition-colors hover:bg-white/10 hover:text-pos-header-foreground focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-0"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </DialogClose>

          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
              <RotateCcw className="h-5 w-5 text-primary" />
              Create Refund
            </DialogTitle>
            <DialogDescription className="text-sm text-pos-header-foreground/60">
              Sale ID: {summary?.sale_number ?? saleId}
            </DialogDescription>
          </DialogHeader>
        </div>

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading refund details...
          </div>
        ) : !receipt || !summary ? null : (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
            <div className="space-y-3">
              <div className="min-h-0 rounded-2xl bg-card p-3.5 shadow-sm sm:p-4">
                <div className="flex items-center justify-between pb-2.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ReceiptText className="h-4 w-4 text-primary" />
                    Refundable items
                  </div>
                  <Badge variant="secondary">{editableItems.length}</Badge>
                </div>

                <ScrollArea className="max-h-[min(32vh,14rem)] md:max-h-[min(40vh,20rem)]">
                  <div className="space-y-2.5 pr-2">
                    {editableItems.map(({ receiptItem, summaryItem }) => {
                      const maxQuantity = summaryItem?.refundable_quantity || 0;
                      const currentValue = quantities[receiptItem.sale_item_id] ?? String(maxQuantity);

                      return (
                        <div
                          key={receiptItem.sale_item_id}
                          className="rounded-xl bg-background p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                        >
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5">
                            <div className="min-w-0">
                              <p className="break-words text-[0.95rem] font-medium leading-snug text-foreground">
                                {receiptItem.product_name}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
                                {money(getRefundableUnitAmount(receiptItem))}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <Label
                              htmlFor={`refund-qty-${receiptItem.sale_item_id}`}
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Quantity
                            </Label>
                            <Input
                              id={`refund-qty-${receiptItem.sale_item_id}`}
                              type="number"
                              min="0"
                              max={maxQuantity}
                              step="0.001"
                              value={currentValue}
                              onChange={(event) =>
                                handleQuantityChange(receiptItem.sale_item_id, event.target.value, maxQuantity)
                              }
                              disabled={maxQuantity <= 0}
                              className="mt-1.5 h-11 text-base font-semibold"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <div className="rounded-2xl bg-card p-3.5 shadow-sm sm:p-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Remaining amount</span>
                    <span className="font-semibold text-foreground">{money(summary.remaining_refundable_total)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Selected items</span>
                    <span className="font-semibold text-foreground">{selectedRefundItems.length}</span>
                  </div>
                  <Separator className="bg-border/60" />
                  <div className="flex items-center justify-between text-base">
                    <span className="font-medium text-foreground">Total refund</span>
                    <span className="font-semibold text-foreground">{money(estimatedRefundTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-card p-3.5 shadow-sm sm:p-4">
                <div className="space-y-2">
                  <Label htmlFor="refund-reason" className="text-sm font-medium text-foreground">
                    Reason
                  </Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger id="refund-reason" className="h-11 w-full text-base">
                      <SelectValue>{getRefundReasonLabel(reason)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {refundReasonOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="grid gap-2.5 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-0.5 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                  className="h-11 w-full"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                  className="h-11 w-full"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Process Refund
                </Button>
              </DialogFooter>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RefundSaleDialog;
