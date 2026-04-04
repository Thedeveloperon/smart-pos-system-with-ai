import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthContext";
import ManagerReportsDrawer from "@/components/pos/ManagerReportsDrawer";
import BillingAdminWorkspace from "@/components/pos/BillingAdminWorkspace";
import { Button } from "@/components/ui/button";
import {
  fetchAiPendingManualPayments,
  verifyAiManualPayment,
  type AiPendingManualPaymentItem,
} from "@/lib/api";

const AdminConsole = () => {
  const { user, logout } = useAuth();
  const normalizedBackendRole = (user?.backendRole || "").trim().toLowerCase();
  const isBillingAdmin = normalizedBackendRole === "billing_admin";
  const [showReports, setShowReports] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [verifyReference, setVerifyReference] = useState("");
  const [isVerifyingAiPayment, setIsVerifyingAiPayment] = useState(false);
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<string | null>(null);
  const [pendingAiPayments, setPendingAiPayments] = useState<AiPendingManualPaymentItem[]>([]);
  const [isLoadingPendingAiPayments, setIsLoadingPendingAiPayments] = useState(false);

  const loadPendingAiPayments = useCallback(async (quiet = false) => {
    setIsLoadingPendingAiPayments(true);
    try {
      const response = await fetchAiPendingManualPayments(80);
      setPendingAiPayments(response.items);
    } catch (error) {
      console.error(error);
      if (!quiet) {
        toast.error(error instanceof Error ? error.message : "Failed to load pending AI payment requests.");
      }
    } finally {
      setIsLoadingPendingAiPayments(false);
    }
  }, []);

  useEffect(() => {
    if (isBillingAdmin) {
      return;
    }

    void loadPendingAiPayments(true);
  }, [isBillingAdmin, loadPendingAiPayments]);

  const handleVerifyAiPayment = useCallback(
    async (payload: { paymentId?: string; externalReference?: string }, clearReferenceInput = false) => {
      const paymentId = payload.paymentId?.trim();
      const externalReference = payload.externalReference?.trim();
      if (!paymentId && !externalReference) {
        toast.error("Payment ID or external reference is required.");
        return;
      }

      setIsVerifyingAiPayment(true);
      setVerifyingPaymentId(paymentId ?? "__by_reference__");
      try {
        const result = await verifyAiManualPayment({
          payment_id: paymentId,
          external_reference: externalReference,
        });
        await loadPendingAiPayments(true);
        toast.success(
          result.payment_status === "succeeded"
            ? "AI payment verified and credits added."
            : `AI payment status: ${result.payment_status.replace("_", " ")}.`,
        );
        if (clearReferenceInput) {
          setVerifyReference("");
        }
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to verify AI payment.");
      } finally {
        setIsVerifyingAiPayment(false);
        setVerifyingPaymentId(null);
      }
    },
    [loadPendingAiPayments],
  );

  const handleVerifyAiPaymentByReference = useCallback(async () => {
    const rawReference = verifyReference.trim();
    if (!rawReference) {
      toast.error("Enter a submitted or external reference.");
      return;
    }

    const normalizedReference = rawReference.toLowerCase();
    const findMatches = (items: AiPendingManualPaymentItem[]) =>
      items.filter((item) => {
        const externalReference = (item.external_reference || "").trim().toLowerCase();
        const submittedReference = (item.submitted_reference || "").trim().toLowerCase();
        return externalReference === normalizedReference || submittedReference === normalizedReference;
      });

    let matches = findMatches(pendingAiPayments);
    if (matches.length === 0) {
      try {
        const refreshed = await fetchAiPendingManualPayments(200);
        setPendingAiPayments(refreshed.items);
        matches = findMatches(refreshed.items);
      } catch {
        // Keep existing message path below.
      }
    }

    if (matches.length === 0) {
      toast.error("No pending payment matched this reference. Refresh and try again.");
      return;
    }

    if (matches.length > 1) {
      toast.error("Multiple pending payments share this reference. Verify from the exact row.");
      return;
    }

    const target = matches[0];
    await handleVerifyAiPayment(
      {
        paymentId: target.payment_id,
      },
      true,
    );
  }, [handleVerifyAiPayment, pendingAiPayments, verifyReference]);

  if (isBillingAdmin) {
    return (
      <BillingAdminWorkspace
        username={user?.username}
        onSignOut={() => {
          void logout();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <ShieldCheck className="h-4 w-4" />
                Super Admin Console
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Licensing Control Plane</h1>
              <p className="text-sm text-muted-foreground">
                Signed in as <span className="font-medium">{user?.username}</span>. Use this page to verify AI credit
                purchase requests and open full license manager controls.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void loadPendingAiPayments();
                }}
              >
                Refresh Requests
              </Button>
              {!showReports && (
                <Button
                  onClick={() => {
                    setShowReports(true);
                    setRefreshToken((current) => current + 1);
                  }}
                >
                  Open License Manager
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  void logout();
                }}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-base font-semibold">AI Credit Purchasing Requests</h2>
            <p className="text-sm text-muted-foreground">
              Pending manual AI payments (`cash` / `bank_deposit`) with submitted reference details.
            </p>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={verifyReference}
              onChange={(event) => setVerifyReference(event.target.value)}
              placeholder="Submitted ref or aicpay_... external ref"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm sm:flex-1"
            />
            <Button
              onClick={() => {
                void handleVerifyAiPaymentByReference();
              }}
              disabled={isVerifyingAiPayment}
            >
              {isVerifyingAiPayment ? "Verifying..." : "Verify by Reference"}
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {isLoadingPendingAiPayments ? (
              <p className="text-sm text-muted-foreground">Loading pending requests...</p>
            ) : pendingAiPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending AI credit purchase requests.</p>
            ) : (
              pendingAiPayments.map((item) => (
                <div
                  key={item.payment_id}
                  className="rounded-md border border-border/70 bg-muted/20 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground">{item.payment_status.replace("_", " ")}</span>
                    <span className="rounded border border-border/70 bg-background px-1.5 py-0.5 text-muted-foreground">
                      {item.payment_method.replace("_", " ")}
                    </span>
                    <span className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                    <span className="ml-auto text-muted-foreground">
                      {item.credits.toFixed(0)} credits ({item.currency} {item.amount.toFixed(2)})
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    User: {item.target_full_name || item.target_username}
                    {item.target_full_name ? ` (${item.target_username})` : ""}
                    {item.shop_name ? ` • Shop: ${item.shop_name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Submitted Ref: {item.submitted_reference || "-"} • External Ref: {item.external_reference}
                  </p>
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void handleVerifyAiPayment({
                          paymentId: item.payment_id,
                          externalReference: item.external_reference,
                        })
                      }
                      disabled={isVerifyingAiPayment && verifyingPaymentId === item.payment_id}
                    >
                      {isVerifyingAiPayment && verifyingPaymentId === item.payment_id ? "Verifying..." : "Verify"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ManagerReportsDrawer
        open={showReports}
        onClose={() => setShowReports(false)}
        refreshToken={refreshToken}
        isSuperAdmin
      />
    </div>
  );
};

export default AdminConsole;
