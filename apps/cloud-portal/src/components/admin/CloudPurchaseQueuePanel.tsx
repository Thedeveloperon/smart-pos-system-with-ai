"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const PendingStatusFilterValue = "__pending_queue__";
const queueStatuses = new Set(["pending", "pending_approval", "submitted", "paid", "payment_pending"]);

function toSentence(value?: string | null) {
  return (value || "").replaceAll("_", " ").trim() || "-";
}

function formatAmount(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function canApproveOrReject(status: string) {
  const normalized = status.trim().toLowerCase();
  return queueStatuses.has(normalized);
}

function resolveShopLabel(item: CloudPurchaseRow) {
  const shopCode = item.shop_code?.trim();
  const shopName = item.shop_name?.trim();

  if (shopName && shopCode && shopName.toLowerCase() !== shopCode.toLowerCase()) {
    return `${shopName} (${shopCode})`;
  }

  return shopName || shopCode || "-";
}

function resolveOwnerName(item: CloudPurchaseRow) {
  return item.owner_full_name?.trim() || "-";
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="portal-kicker">Commerce Operations</p>
          <h2 className="text-base font-semibold">{heading}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            const normalizedStatus = item.status.trim().toLowerCase();
            const isSubmitting = submittingId === item.purchase_id;
            const shopLabel = resolveShopLabel(item);
            const ownerName = resolveOwnerName(item);
            return (
              <div key={item.purchase_id} className="rounded-xl border border-border/70 bg-surface-muted p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{item.order_number}</span>
                  <span className="text-muted-foreground">Shop: {shopLabel}</span>
                  <span className="text-muted-foreground">Owner: {ownerName}</span>
                  <StatusChip tone={normalizedStatus === "rejected" ? "warning" : "info"}>
                    {toSentence(item.status)}
                  </StatusChip>
                  <span className="ml-auto text-muted-foreground">
                    {formatAmount(item.total_amount, item.currency)}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {item.items.map((purchaseItem, index) => (
                    <p key={`${item.purchase_id}-${purchaseItem.product_code}-${index}`}>
                      {purchaseItem.product_name} ({purchaseItem.product_code}) x {purchaseItem.quantity}
                    </p>
                  ))}
                </div>

                <div className="grid gap-2 md:grid-cols-[2fr,1fr]">
                  <Input
                    value={actorNotes[item.purchase_id] || ""}
                    onChange={(event) =>
                      setActorNotes((current) => ({
                        ...current,
                        [item.purchase_id]: event.target.value,
                      }))
                    }
                    placeholder="Actor note (required)"
                  />
                  <Input
                    value={reasonCodes[item.purchase_id] || ""}
                    onChange={(event) =>
                      setReasonCodes((current) => ({
                        ...current,
                        [item.purchase_id]: event.target.value,
                      }))
                    }
                    placeholder="Reason code (optional)"
                  />
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {canApproveOrReject(item.status) && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => {
                          void runAction(item.purchase_id, "reject", rejectAdminCloudPurchase);
                        }}
                      >
                        {isSubmitting ? "Processing..." : "Reject"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={() => {
                          void runAction(item.purchase_id, "approve", approveAdminCloudPurchase);
                        }}
                      >
                        {isSubmitting ? "Processing..." : "Approve"}
                      </Button>
                    </>
                  )}
                  {normalizedStatus === "approved" && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => {
                        void runAction(item.purchase_id, "assign", assignAdminCloudPurchase);
                      }}
                    >
                      {isSubmitting ? "Processing..." : "Assign"}
                    </Button>
                  )}
                  {normalizedStatus === "assigned" && item.assignment_id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => {
                        void handleRevoke(item.assignment_id!, item.purchase_id);
                      }}
                    >
                      {isSubmitting ? "Processing..." : "Revoke Assignment"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
};

export default CloudPurchaseQueuePanel;
