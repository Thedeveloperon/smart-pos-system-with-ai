import { useState } from "react";
import { Input } from "@/components/ui/input";
import { SRI_LANKAN_DENOMINATIONS, type DenominationCount } from "./types";
import { Banknote, Coins } from "lucide-react";

interface DenominationCounterProps {
  onChange: (counts: DenominationCount[], total: number) => void;
  initialCounts?: DenominationCount[];
}

const DenominationCounter = ({ onChange, initialCounts }: DenominationCounterProps) => {
  const [quantities, setQuantities] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    SRI_LANKAN_DENOMINATIONS.forEach(d => {
      const existing = initialCounts?.find(c => c.denomination === d.value);
      map[d.value] = existing?.quantity || 0;
    });
    return map;
  });

  const handleChange = (denomination: number, qty: number) => {
    const safeQty = Math.max(0, Math.floor(qty) || 0);
    const updated = { ...quantities, [denomination]: safeQty };
    setQuantities(updated);

    const counts: DenominationCount[] = SRI_LANKAN_DENOMINATIONS.map(d => ({
      denomination: d.value,
      quantity: updated[d.value] || 0,
    }));
    const total = counts.reduce((sum, c) => sum + c.denomination * c.quantity, 0);
    onChange(counts, total);
  };

  const total = SRI_LANKAN_DENOMINATIONS.reduce(
    (sum, d) => sum + d.value * (quantities[d.value] || 0),
    0
  );

  const isCoin = (value: number) => value <= 10;

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_100px] gap-2 px-2 pb-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Denomination</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Qty</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Subtotal</span>
      </div>

      {/* Rows */}
      {SRI_LANKAN_DENOMINATIONS.map(d => {
        const qty = quantities[d.value] || 0;
        const subtotal = d.value * qty;
        const coin = isCoin(d.value);

        return (
          <div
            key={d.value}
            className={`grid grid-cols-[1fr_80px_100px] gap-2 items-center px-2 py-1.5 rounded-lg transition-colors ${
              qty > 0 ? "bg-accent/50" : "hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2">
              {coin ? (
                <Coins className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="font-medium text-sm">
                Rs. {d.label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {coin ? "coin" : "note"}
              </span>
            </div>

            <Input
              type="number"
              min={0}
              value={qty || ""}
              onChange={e => handleChange(d.value, parseInt(e.target.value) || 0)}
              placeholder="0"
              className="h-8 text-center text-sm font-medium rounded-lg"
            />

            <div className="text-right text-sm font-medium tabular-nums">
              {subtotal > 0 ? (
                <span className="text-foreground">Rs. {subtotal.toLocaleString()}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Total */}
      <div className="border-t-2 border-primary/30 pt-3 mt-3 px-2">
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Total Counted
          </span>
          <span className="text-2xl font-extrabold text-primary tabular-nums">
            Rs. {total.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DenominationCounter;
