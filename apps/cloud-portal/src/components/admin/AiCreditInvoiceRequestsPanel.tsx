import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  approveAdminAiCreditInvoice,
  fetchAdminAiCreditInvoices,
  rejectAdminAiCreditInvoice,
  type AiCreditInvoiceRow,
} from "@/lib/adminApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formatAmount = (amount: number, currency: string) =>
  `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const toSentence = (value?: string | null) => (value || "").replaceAll("_", " ").trim() || "-";

const AiCreditInvoiceRequestsPanel = () => {
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [items, setItems] = useState<AiCreditInvoiceRow[]>([]);
  const [actorNotes, setActorNotes] = useState<Record<string, string>>({});
  const [rejectReasonCodes, setRejectReasonCodes] = useState<Record<string, string>>({});

  const load = useCallback(async (quiet = false) => {
    setLoading(true);
    try {
      const response = await fetchAdminAiCreditInvoices(120);
      setItems(Array.isArray(response.items) ? response.items : []);
    } catch (error) {
      console.error(error);
      if (!quiet) {
        toast.error(error instanceof Error ? error.message : "Failed to load AI credit invoice queue.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const pendingItems = useMemo(
    () => items.filter((item) => (item.status || "").toLowerCase() === "pending"),
    [items],
  );

  const resolveActorNote = useCallback(
    (invoiceId: string) => actorNotes[invoiceId]?.trim() || "",
    [actorNotes],
  );
  const resolveRejectReasonCode = useCallback(
    (invoiceId: string) => rejectReasonCodes[invoiceId]?.trim() || "",
    [rejectReasonCodes],
  );

  const handleApprove = useCallback(
    async (invoiceId: string) => {
      const actorNote = resolveActorNote(invoiceId);
      if (!actorNote) {
        toast.error("Actor note is required for approval.");
        return;
      }

      setSubmittingId(invoiceId);
      try {
        await approveAdminAiCreditInvoice(invoiceId, { actor_note: actorNote });
        toast.success("Invoice approved and wallet credited.");
        await load(true);
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to approve invoice.");
      } finally {
        setSubmittingId(null);
      }
    },
    [load, resolveActorNote],
  );

  const handleReject = useCallback(
    async (invoiceId: string) => {
      const actorNote = resolveActorNote(invoiceId);
      if (!actorNote) {
        toast.error("Actor note is required for rejection.");
        return;
      }

      setSubmittingId(invoiceId);
      try {
        await rejectAdminAiCreditInvoice(invoiceId, {
          actor_note: actorNote,
          reason_code: resolveRejectReasonCode(invoiceId) || undefined,
        });
        toast.success("Invoice rejected.");
        await load(true);
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to reject invoice.");
      } finally {
        setSubmittingId(null);
      }
    },
    [load, resolveActorNote, resolveRejectReasonCode],
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">AI Credit Invoice Requests</h2>
        <Badge variant={pendingItems.length > 0 ? "destructive" : "secondary"}>
          Pending {pendingItems.length}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => {
            void load();
          }}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {pendingItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending owner-created AI credit invoices.</p>
      ) : (
        <div className="space-y-3">
          {pendingItems.map((item) => {
            const isSubmitting = submittingId === item.invoice_id;
            return (
              <div key={item.invoice_id} className="rounded-xl border border-border/70 bg-surface-muted p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{item.invoice_number}</span>
                  <span className="text-muted-foreground">Shop: {item.shop_code}</span>
                  <span className="text-muted-foreground">Pack: {item.pack_code}</span>
                  <span className="text-muted-foreground">
                    {item.requested_credits.toLocaleString()} credits
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {formatAmount(item.amount_due, item.currency)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Status: {toSentence(item.status)} · Created: {new Date(item.created_at).toLocaleString()}
                </p>

                <div className="grid gap-2 md:grid-cols-[2fr,1fr]">
                  <Input
                    value={actorNotes[item.invoice_id] || ""}
                    onChange={(event) =>
                      setActorNotes((current) => ({
                        ...current,
                        [item.invoice_id]: event.target.value,
                      }))
                    }
                    placeholder="Actor note (required)"
                  />
                  <Input
                    value={rejectReasonCodes[item.invoice_id] || ""}
                    onChange={(event) =>
                      setRejectReasonCodes((current) => ({
                        ...current,
                        [item.invoice_id]: event.target.value,
                      }))
                    }
                    placeholder="Reject reason code (optional)"
                  />
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => {
                      void handleReject(item.invoice_id);
                    }}
                  >
                    {isSubmitting ? "Processing..." : "Reject"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => {
                      void handleApprove(item.invoice_id);
                    }}
                  >
                    {isSubmitting ? "Processing..." : "Approve + Credit"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default AiCreditInvoiceRequestsPanel;
