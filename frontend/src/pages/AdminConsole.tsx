import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthContext";
import ManagerReportsDrawer from "@/components/pos/ManagerReportsDrawer";
import BillingAdminWorkspace from "@/components/pos/BillingAdminWorkspace";
import { Button } from "@/components/ui/button";
import { verifyAiManualPayment } from "@/lib/api";

const AdminConsole = () => {
  const { user, logout } = useAuth();
  const normalizedBackendRole = (user?.backendRole || "").trim().toLowerCase();
  const isBillingAdmin = normalizedBackendRole === "billing_admin";
  const [showReports, setShowReports] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [verifyReference, setVerifyReference] = useState("");
  const [isVerifyingAiPayment, setIsVerifyingAiPayment] = useState(false);

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
                Signed in as <span className="font-medium">{user?.username}</span>. Use the Support tab to manage
                device revocations, grace extensions, resyncs, and audit logs.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowReports(true);
                  setRefreshToken((current) => current + 1);
                }}
              >
                Refresh Data
              </Button>
              {!showReports && (
                <Button
                  onClick={() => {
                    setShowReports(true);
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
            <h2 className="text-base font-semibold">AI Manual Credit Verification</h2>
            <p className="text-sm text-muted-foreground">
              Verify pending AI manual payments (`cash`/`bank_deposit`) using `external_reference`.
            </p>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={verifyReference}
              onChange={(event) => setVerifyReference(event.target.value)}
              placeholder="aicpay_... external reference"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm sm:flex-1"
            />
            <Button
              onClick={async () => {
                const externalReference = verifyReference.trim();
                if (!externalReference) {
                  toast.error("Enter external reference first.");
                  return;
                }

                setIsVerifyingAiPayment(true);
                try {
                  const result = await verifyAiManualPayment({ external_reference: externalReference });
                  toast.success(
                    result.payment_status === "succeeded"
                      ? "AI payment verified and credits added."
                      : `AI payment status: ${result.payment_status.replace("_", " ")}.`,
                  );
                  setVerifyReference("");
                } catch (error) {
                  console.error(error);
                  toast.error(error instanceof Error ? error.message : "Failed to verify AI payment.");
                } finally {
                  setIsVerifyingAiPayment(false);
                }
              }}
              disabled={isVerifyingAiPayment}
            >
              {isVerifyingAiPayment ? "Verifying..." : "Verify AI Payment"}
            </Button>
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
