import { Badge } from "@/components/ui/badge";
import type { StockMovement } from "@/lib/api";

const styles: Record<StockMovement["movement_type"], string> = {
  Sale: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  Purchase: "bg-green-100 text-green-800 hover:bg-green-100",
  Refund: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  Adjustment: "bg-gray-100 text-gray-800 hover:bg-gray-100",
  ExpiryWriteOff: "bg-red-100 text-red-800 hover:bg-red-100",
  StocktakeReconciliation: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  Transfer: "bg-slate-100 text-slate-800 hover:bg-slate-100",
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
