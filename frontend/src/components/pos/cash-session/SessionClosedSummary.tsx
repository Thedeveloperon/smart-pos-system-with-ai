import { Button } from "@/components/ui/button";
import { CheckCircle2, FileText, RotateCcw, Shield, AlertTriangle } from "lucide-react";
import type { CashSession } from "./types";

interface SessionClosedSummaryProps {
  session: CashSession;
  onNewSession: () => void;
  onViewAuditLog: () => void;
}

const SessionClosedSummary = ({ session, onNewSession, onViewAuditLog }: SessionClosedSummaryProps) => {
  const hasMismatch = session.difference !== undefined && session.difference !== 0;
  const isShortage = (session.difference || 0) < 0;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
          hasMismatch ? "bg-warning/10" : "bg-success/10"
        }`}>
          {hasMismatch ? (
            <AlertTriangle className="h-8 w-8 text-warning" />
          ) : (
            <CheckCircle2 className="h-8 w-8 text-success" />
          )}
        </div>

        <div>
          <h2 className="text-xl font-bold mb-1">Shift Closed</h2>
          <p className="text-sm text-muted-foreground">
            Session for {session.cashierName} has been completed and locked.
          </p>
        </div>

        <div className="rounded-xl bg-card border border-border p-4 space-y-3 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Opening Cash</span>
            <span className="font-medium tabular-nums">Rs. {session.opening.total.toLocaleString()}</span>
          </div>
          {session.closing && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Closing Cash</span>
              <span className="font-medium tabular-nums">Rs. {session.closing.total.toLocaleString()}</span>
            </div>
          )}
          {session.expectedCash !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Expected Cash</span>
              <span className="font-medium tabular-nums">Rs. {session.expectedCash.toLocaleString()}</span>
            </div>
          )}
          <div className="h-px bg-border" />
          <div className={`flex justify-between text-sm font-semibold ${
            hasMismatch
              ? isShortage ? "text-destructive" : "text-warning"
              : "text-success"
          }`}>
            <span>Difference</span>
            <span className="tabular-nums">
              {hasMismatch
                ? `${isShortage ? "-" : "+"} Rs. ${Math.abs(session.difference!).toLocaleString()}`
                : "Rs. 0 (Balanced)"}
            </span>
          </div>
          {session.differenceReason && (
            <>
              <div className="h-px bg-border" />
              <div className="text-sm">
                <span className="text-muted-foreground">Reason: </span>
                <span>{session.differenceReason}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="pos-primary"
            size="lg"
            className="w-full rounded-xl"
            onClick={onNewSession}
          >
            <RotateCcw className="h-4 w-4" />
            Start New Session
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={onViewAuditLog}
          >
            <FileText className="h-4 w-4" />
            View Audit Trail
          </Button>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          Session locked at {session.closedAt?.toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export default SessionClosedSummary;
