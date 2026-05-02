import { Badge } from "@/components/ui/badge";
import type { PurchaseOrderStatus } from "@/lib/purchases";
import { cn } from "@/lib/utils";

const statusConfig: Record<PurchaseOrderStatus, { label: string; className: string }> = {
  Draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  Sent: { label: "Sent", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  PartiallyReceived: { label: "Partial", className: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
  Received: { label: "Received", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  Cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700 hover:bg-red-100" },
};

export default function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const cfg = statusConfig[status];
  return <Badge className={cn("border-0", cfg.className)}>{cfg.label}</Badge>;
}
