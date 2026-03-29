import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  ShoppingCart,
  Lock,
  DollarSign,
  Clock,
} from "lucide-react";
import type { AuditLogEntry } from "./types";

interface AuditLogPanelProps {
  open: boolean;
  onClose: () => void;
  entries: AuditLogEntry[];
}

const getIcon = (action: string) => {
  switch (action) {
    case "SESSION_OPENED": return <Shield className="h-3.5 w-3.5 text-success" />;
    case "SESSION_CLOSED": return <Lock className="h-3.5 w-3.5 text-primary" />;
    case "SALE_COMPLETED": return <ShoppingCart className="h-3.5 w-3.5 text-foreground" />;
    default: return <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />;
  }
};

const getBadgeVariant = (action: string) => {
  switch (action) {
    case "SESSION_OPENED": return "default";
    case "SESSION_CLOSED": return "secondary";
    case "SALE_COMPLETED": return "outline";
    default: return "outline";
  }
};

const AuditLogPanel = ({ open, onClose, entries }: AuditLogPanelProps) => {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Audit Trail
          </SheetTitle>
          <SheetDescription>
            Complete log of all cash session activities.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-4 -mx-6 px-6">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No audit entries yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...entries].reverse().map(entry => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getIcon(entry.action)}
                      <Badge variant={getBadgeVariant(entry.action) as any} className="text-[10px]">
                        {entry.action.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {entry.performedAt.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {entry.details}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>By: {entry.performedBy}</span>
                    {entry.amount !== undefined && (
                      <span className="font-medium text-foreground">
                        Rs. {entry.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default AuditLogPanel;
