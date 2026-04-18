"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CreditCard,
  DollarSign,
  Hash,
  Package,
  Store,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approveAdminCloudPurchase,
  assignAdminCloudPurchase,
  fetchAdminCloudPurchases,
  rejectAdminCloudPurchase,
  revokeAdminCloudAssignment,
  type CloudPurchaseRow,
} from "@/lib/adminApi";
import { SectionCard, StatusChip } from "@/components/portal/layout-primitives";

type CloudPurchaseQueuePanelProps = {
  heading?: string;
};

type CloudPurchaseRuntime = CloudPurchaseRow & {
  billing_mode?: string | null;
  validity?: string | null;
};

type CloudPurchaseItemRuntime = CloudPurchaseRow["items"][number] & {
  billing_mode?: string | null;
  validity?: string | null;
};

type PurchaseStatusVisual = {
  accentClassName: string;
  statusClassName: string;
  statusDotClassName: string;
  amountClassName: string;
};

type PurchaseMetaCellProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  secondary?: string;
  valueAsPill?: boolean;
};

const PendingStatusFilterValue = "__pending_queue__";
const queueStatuses = new Set(["pending", "pending_approval", "submitted", "paid", "payment_pending"]);

function toSentence(value?: string | null) {
  return (value || "").replaceAll("_", " ").trim() || "-";
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}

function formatMoney(amount: number, currency: string) {
  const normalizedCurrency = currency?.trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function canApproveOrReject(status: string) {
  const normalized = status.trim().toLowerCase();
  return queueStatuses.has(normalized);
}

function resolveShopLabel(item: CloudPurchaseRow) {
  const shopCode = item.shop_code?.trim();
  const shopName = item.shop_name?.trim();

  return shopName || shopCode || "-";
}

function resolveOwnerName(item: CloudPurchaseRow) {
  return item.owner_full_name?.trim() || item.owner_username?.trim() || "-";
}

function formatOrderNumber(orderNumber: string) {
  const normalized = orderNumber.trim();
  if (!normalized) return "#-";
  return normalized.startsWith("#") ? normalized : `#${normalized}`;
}

function humanizeToken(value?: string | null) {
  const normalized = (value || "").replace(/[_:/.-]+/g, " ").trim();
  if (!normalized) return "-";
  return toTitleCase(normalized);
}

function resolveProductType(item?: CloudPurchaseItemRuntime) {
  const explicitType = item?.product_type?.trim();
  if (explicitType) {
    return toTitleCase(toSentence(explicitType));
  }

  const fromCode = item?.product_code?.split(":")[0];
  if (fromCode) {
    return toTitleCase(toSentence(fromCode));
  }

  return "-";
}

function resolveProductName(item?: CloudPurchaseItemRuntime) {
  const explicitName = item?.product_name?.trim();
  if (explicitName) {
    return explicitName;
  }

  const productCode = item?.product_code?.trim();
  if (!productCode) {
    return "-";
  }

  const [, suffix] = productCode.split(":");
  return humanizeToken(suffix || productCode);
}

function resolveBillingMode(purchase: CloudPurchaseRuntime, item?: CloudPurchaseItemRuntime) {
  const explicitMode = item?.billing_mode?.trim() || purchase.billing_mode?.trim();
  if (explicitMode) {
    return toTitleCase(toSentence(explicitMode));
  }

  if ((item?.product_type || "").trim().toLowerCase() === "ai_credit") {
    return "One time";
  }

  return "-";
}

function resolveValidity(purchase: CloudPurchaseRuntime, item?: CloudPurchaseItemRuntime) {
  const explicitValidity = item?.validity?.trim() || purchase.validity?.trim();
  if (explicitValidity) {
    return humanizeToken(explicitValidity);
  }

  return "-";
}

function resolveStatusVisual(normalizedStatus: string): PurchaseStatusVisual {
  if (queueStatuses.has(normalizedStatus)) {
    return {
      accentClassName: "border-l-amber-400",
      statusClassName: "border border-amber-200 bg-amber-50 text-amber-700",
      statusDotClassName: "bg-amber-500",
      amountClassName: "text-[#205f59]",
    };
  }

  if (normalizedStatus === "approved" || normalizedStatus === "assigned") {
    return {
      accentClassName: "border-l-emerald-400",
      statusClassName: "border border-emerald-200 bg-emerald-50 text-emerald-700",
      statusDotClassName: "bg-emerald-500",
      amountClassName: "text-emerald-700",
    };
  }

  if (normalizedStatus === "rejected" || normalizedStatus === "cancelled") {
    return {
      accentClassName: "border-l-rose-400",
      statusClassName: "border border-rose-200 bg-rose-50 text-rose-700",
      statusDotClassName: "bg-rose-500",
      amountClassName: "text-rose-900",
    };
  }

  return {
    accentClassName: "border-l-slate-300",
    statusClassName: "border border-slate-200 bg-slate-50 text-slate-700",
    statusDotClassName: "bg-slate-500",
    amountClassName: "text-[#205f59]",
  };
}

function PurchaseMetaCell({ icon: Icon, label, value, secondary, valueAsPill = false }: PurchaseMetaCellProps) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f4ef] text-[#5f8f86]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#5f8f8a]">{label}</p>
        {valueAsPill ? (
          <span className="mt-1 inline-flex items-center rounded-full border border-[#c5dfd7] bg-[#eaf6f1] px-2.5 py-0.5 text-sm font-medium text-[#2b7166]">
            {value}
          </span>
        ) : (
          <p className="mt-0.5 break-words text-[1.1rem] font-semibold leading-tight text-[#1f5f59]">{value}</p>
        )}
        {secondary && <p className="mt-0.5 break-all text-xs text-[#6f9b93]">{secondary}</p>}
      </div>
    </div>
  );
}

const CloudPurchaseQueuePanel = ({ heading = "Purchase Queue" }: CloudPurchaseQueuePanelProps) => {
  const [items, setItems] = useState<CloudPurchaseRow[]>([]);
  const [statusFilter, setStatusFilter] = useState(PendingStatusFilterValue);
  const [isLoading, setIsLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actorNotes, setActorNotes] = useState<Record<string, string>>({});
  const [reasonCodes, setReasonCodes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const statusForQuery = statusFilter === PendingStatusFilterValue ? undefined : statusFilter;
      const response = await fetchAdminCloudPurchases({
        status: statusForQuery,
        take: 150,
      });
      const responseItems = Array.isArray(response.items) ? response.items : [];
      if (statusFilter === PendingStatusFilterValue) {
        setItems(responseItems.filter((item) => queueStatuses.has((item.status || "").trim().toLowerCase())));
      } else {
        setItems(responseItems);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load purchase queue.");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(() => items.filter((item) => queueStatuses.has(item.status.trim().toLowerCase())).length, [items]);

  const resolveActorNote = useCallback((purchaseId: string) => actorNotes[purchaseId]?.trim() || "", [actorNotes]);
  const resolveReasonCode = useCallback((purchaseId: string) => reasonCodes[purchaseId]?.trim() || "", [reasonCodes]);

  const runAction = useCallback(
    async (
      purchaseId: string,
      operation: "approve" | "reject" | "assign",
      fn: (id: string, payload: { actor_note: string; reason_code?: string }) => Promise<unknown>,
    ) => {
      const actorNote = resolveActorNote(purchaseId);
      if (!actorNote) {
        toast.error("Actor note is required.");
        return;
      }

      setSubmittingId(purchaseId);
      try {
        await fn(purchaseId, {
          actor_note: actorNote,
          reason_code: resolveReasonCode(purchaseId) || undefined,
        });
        toast.success(`Purchase ${operation}d.`);
        await load();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : `Failed to ${operation} purchase.`);
      } finally {
        setSubmittingId(null);
      }
    },
    [load, resolveActorNote, resolveReasonCode],
  );

  const handleRevoke = useCallback(
    async (assignmentId: string, purchaseId: string) => {
      const actorNote = resolveActorNote(purchaseId);
      if (!actorNote) {
        toast.error("Actor note is required.");
        return;
      }

      setSubmittingId(purchaseId);
      try {
        await revokeAdminCloudAssignment(assignmentId, {
          actor_note: actorNote,
          reason_code: resolveReasonCode(purchaseId) || undefined,
        });
        toast.success("Assignment revoked.");
        await load();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to revoke assignment.");
      } finally {
        setSubmittingId(null);
      }
    },
    [load, resolveActorNote, resolveReasonCode],
  );

  return (
    <SectionCard className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="portal-kicker">Commerce Operations</p>
          <h2 className="text-base font-semibold">{heading}</h2>
        </div>
        <div className="flex min-w-[220px] flex-col items-start gap-2 sm:items-end">
          <StatusChip tone={pendingCount > 0 ? "warning" : "neutral"}>Pending {pendingCount}</StatusChip>
          <select
            className="field-shell h-9 w-[180px] text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value={PendingStatusFilterValue}>Pending queue</option>
            <option value="pending">Pending</option>
            <option value="pending_approval">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="assigned">Assigned</option>
            <option value="rejected">Rejected</option>
            <option value="">All statuses</option>
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void load();
            }}
            disabled={isLoading}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No purchases matched this filter.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const purchase = item as CloudPurchaseRuntime;
            const normalizedStatus = item.status.trim().toLowerCase();
            const statusVisual = resolveStatusVisual(normalizedStatus);
            const isSubmitting = submittingId === item.purchase_id;
            const shopLabel = resolveShopLabel(item);
            const ownerName = resolveOwnerName(item);
            const primaryItem = (item.items[0] as CloudPurchaseItemRuntime | undefined) || undefined;
            const productType = resolveProductType(primaryItem);
            const productName = resolveProductName(primaryItem);
            const totalQuantity = item.items.reduce((sum, purchaseItem) => sum + (Number(purchaseItem.quantity) || 0), 0);
            const unitPriceBase = Number(primaryItem?.amount ?? item.total_amount) || 0;
            const unitPriceQuantity = Number(primaryItem?.quantity || totalQuantity || 1);
            const unitPrice = unitPriceQuantity > 0 ? unitPriceBase / unitPriceQuantity : unitPriceBase;
            const billingMode = resolveBillingMode(purchase, primaryItem);
            const validityPeriod = resolveValidity(purchase, primaryItem);
            const ownerUsername = item.owner_username?.trim();
            const ownerSecondary =
              ownerUsername && ownerUsername.toLowerCase() !== ownerName.toLowerCase() ? ownerUsername : undefined;
            const shopSecondary =
              item.shop_name?.trim() && item.shop_code?.trim() && item.shop_name?.trim().toLowerCase() !== item.shop_code.trim().toLowerCase()
                ? item.shop_code
                : undefined;
            const canMutate =
              canApproveOrReject(item.status) ||
              normalizedStatus === "approved" ||
              (normalizedStatus === "assigned" && Boolean(item.assignment_id));

            return (
              <div
                key={item.purchase_id}
                className={`overflow-hidden rounded-2xl border border-[#d4e6e0] border-l-4 bg-[#f7fcfa] shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${statusVisual.accentClassName}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[1.45rem] font-semibold tracking-tight text-[#1f5f59]">
                      {formatOrderNumber(item.order_number)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${statusVisual.statusClassName}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusVisual.statusDotClassName}`} />
                      {toTitleCase(toSentence(item.status))}
                    </span>
                  </div>
                  <span className={`text-4xl font-semibold leading-none tracking-tight sm:text-[2.55rem] ${statusVisual.amountClassName}`}>
                    {formatMoney(item.total_amount, item.currency)}
                  </span>
                </div>

                <div className="border-t border-[#d4e6e0] px-6 py-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <PurchaseMetaCell icon={Store} label="Shop" value={shopLabel} secondary={shopSecondary} />
                    <PurchaseMetaCell icon={UserRound} label="Owner" value={ownerName} secondary={ownerSecondary} />
                  </div>
                </div>

                <div className="border-t border-[#d4e6e0] px-6 py-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <PurchaseMetaCell icon={Tag} label="Product Type" value={productType} />
                    <PurchaseMetaCell icon={Package} label="Product Name" value={productName} secondary={primaryItem?.product_code} />
                    <PurchaseMetaCell icon={Hash} label="Quantity" value={`x ${formatQuantity(totalQuantity || 0)}`} />
                    <PurchaseMetaCell icon={DollarSign} label="Unit Price" value={formatMoney(unitPrice, item.currency)} />
                  </div>
                </div>

                <div className="border-t border-[#d4e6e0] px-6 py-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <PurchaseMetaCell icon={CreditCard} label="Billing Mode" value={billingMode} valueAsPill />
                    <PurchaseMetaCell icon={CalendarDays} label="Validity Period" value={validityPeriod} />
                  </div>
                </div>

                {canMutate && (
                  <div className="border-t border-[#d4e6e0] px-6 py-5">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f8f8a]">
                          Actor Note *
                        </span>
                        <textarea
                          value={actorNotes[item.purchase_id] || ""}
                          onChange={(event) =>
                            setActorNotes((current) => ({
                              ...current,
                              [item.purchase_id]: event.target.value,
                            }))
                          }
                          placeholder="Required. Add context for this decision..."
                          className="field-shell min-h-[102px] resize-y rounded-xl border-[#cfe4dd] bg-[#f2fbf7] text-sm text-[#244a45] placeholder:text-[#7aa79e] focus:border-[#7cc9b2] focus:ring-[#7cc9b2]/20"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f8f8a]">
                          Reason Code (Optional)
                        </span>
                        <Input
                          value={reasonCodes[item.purchase_id] || ""}
                          onChange={(event) =>
                            setReasonCodes((current) => ({
                              ...current,
                              [item.purchase_id]: event.target.value,
                            }))
                          }
                          placeholder="e.g. FRAUD_RISK"
                          className="h-11 rounded-xl border-[#cfe4dd] bg-[#f2fbf7] text-[#244a45] placeholder:text-[#7aa79e] focus-visible:ring-[#7cc9b2]/30"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap justify-end gap-2.5">
                      {canApproveOrReject(item.status) && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-11 rounded-xl border-rose-200 bg-white px-5 text-rose-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                            disabled={isSubmitting}
                            onClick={() => {
                              void runAction(item.purchase_id, "reject", rejectAdminCloudPurchase);
                            }}
                          >
                            <X className="h-4 w-4" />
                            {isSubmitting ? "Processing..." : "Reject"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-11 rounded-xl bg-emerald-500 px-6 text-white hover:bg-emerald-600"
                            disabled={isSubmitting}
                            onClick={() => {
                              void runAction(item.purchase_id, "approve", approveAdminCloudPurchase);
                            }}
                          >
                            <Check className="h-4 w-4" />
                            {isSubmitting ? "Processing..." : "Approve"}
                          </Button>
                        </>
                      )}
                      {normalizedStatus === "approved" && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-11 rounded-xl bg-emerald-500 px-6 text-white hover:bg-emerald-600"
                          disabled={isSubmitting}
                          onClick={() => {
                            void runAction(item.purchase_id, "assign", assignAdminCloudPurchase);
                          }}
                        >
                          <Check className="h-4 w-4" />
                          {isSubmitting ? "Processing..." : "Assign"}
                        </Button>
                      )}
                      {normalizedStatus === "assigned" && item.assignment_id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-11 rounded-xl border-amber-200 bg-white px-5 text-amber-700 hover:border-amber-300 hover:bg-amber-50"
                          disabled={isSubmitting}
                          onClick={() => {
                            void handleRevoke(item.assignment_id!, item.purchase_id);
                          }}
                        >
                          <X className="h-4 w-4" />
                          {isSubmitting ? "Processing..." : "Revoke Assignment"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {!canMutate && (
                  <div className="border-t border-[#d4e6e0] px-6 py-3 text-xs text-[#6f9b93]">
                    Updated {new Date(item.updated_at || item.created_at).toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
};

export default CloudPurchaseQueuePanel;
