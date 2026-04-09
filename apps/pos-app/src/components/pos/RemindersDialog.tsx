import { AlertTriangle, Bell, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReminderItem } from "@/lib/api";

interface RemindersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminders: ReminderItem[];
  openCount: number;
  loading: boolean;
  onRefresh: () => void;
  onAcknowledge: (reminderId: string) => void;
  onRunNow?: () => void;
  canRunNow?: boolean;
  isRunningNow?: boolean;
}

function formatDateTime(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "-";
  }

  return timestamp.toLocaleString();
}

function getSeverityClassName(value: string): string {
  switch (value) {
    case "critical":
      return "border-red-300 bg-red-50 text-red-700";
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-700";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

const RemindersDialog = ({
  open,
  onOpenChange,
  reminders,
  openCount,
  loading,
  onRefresh,
  onAcknowledge,
  onRunNow,
  canRunNow = false,
  isRunningNow = false,
}: RemindersDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Reminders
            <Badge variant="outline" className="ml-1">
              {openCount} open
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Operational alerts, smart report notifications, and follow-up tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {canRunNow && onRunNow && (
            <Button size="sm" variant="outline" onClick={onRunNow} disabled={isRunningNow}>
              {isRunningNow ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Clock3 className="mr-1 h-3.5 w-3.5" />}
              Run Now
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
            {loading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Refresh
          </Button>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading reminders...
            </div>
          ) : reminders.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No reminders available.
            </div>
          ) : (
            reminders.map((item) => {
              const isOpen = item.status === "open";

              return (
                <div
                  key={item.reminder_id}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.message}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={getSeverityClassName(item.severity)}>
                        {item.severity}
                      </Badge>
                      <Badge variant={isOpen ? "default" : "secondary"}>{item.status}</Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{item.event_type}</span>
                      <span>•</span>
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>

                    {isOpen ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAcknowledge(item.reminder_id)}
                        className="h-7"
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Acknowledge
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Acknowledged {item.acknowledged_at ? formatDateTime(item.acknowledged_at) : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RemindersDialog;
