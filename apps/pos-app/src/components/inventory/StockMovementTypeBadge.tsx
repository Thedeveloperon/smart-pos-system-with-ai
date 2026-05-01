import { Badge } from "@/components/ui/badge";
import type { StockMovement } from "@/lib/api";

const styles: Record<StockMovement["movement_type"], string> = {
  Sale: "bg-info/15 text-info hover:bg-info/15",
  Purchase: "bg-success/15 text-success hover:bg-success/15",
  Refund: "bg-warning/15 text-warning-foreground hover:bg-warning/15",
  Adjustment: "bg-muted text-muted-foreground hover:bg-muted",
  ExpiryWriteOff: "bg-destructive/15 text-destructive hover:bg-destructive/15",
  StocktakeReconciliation: "bg-primary/15 text-primary hover:bg-primary/15",
  Transfer: "bg-secondary text-secondary-foreground hover:bg-secondary",
};

const labels: Record<StockMovement["movement_type"], string> = {
  Sale: "Sale",
  Purchase: "Purchase",
  Refund: "Refund",
  Adjustment: "Adjustment",
  ExpiryWriteOff: "Expiry write-off",
  StocktakeReconciliation: "Stocktake",
  Transfer: "Transfer",
};

export default function StockMovementTypeBadge({ type }: { type: StockMovement["movement_type"] }) {
  return <Badge className={styles[type]}>{labels[type]}</Badge>;
}
