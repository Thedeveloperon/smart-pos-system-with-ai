import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import ManagerReportsDrawer from "@/components/pos/ManagerReportsDrawer";
import { Button } from "@/components/ui/button";

const AdminConsole = () => {
  const { user, logout } = useAuth();
  const [showReports, setShowReports] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

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
