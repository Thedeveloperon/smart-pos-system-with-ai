import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Banknote, Coins, Minus, Plus } from "lucide-react";
import { SRI_LANKAN_DENOMINATIONS, type DenominationCount } from "./types";

interface DenominationCounterProps {
  onChange: (counts: DenominationCount[], total: number) => void;
  initialCounts?: DenominationCount[];
  compact?: boolean;
  warningDenominations?: number[];
  flashDenominations?: number[];
}

const DenominationCounter = ({
  onChange,
  initialCounts,
  compact = false,
  warningDenominations = [],
  flashDenominations = [],
}: DenominationCounterProps) => {
  const [quantities, setQuantities] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    SRI_LANKAN_DENOMINATIONS.forEach((d) => {
      const existing = initialCounts?.find((c) => c.denomination === d.value);
      map[d.value] = existing?.quantity || 0;
    });
    return map;
  });

  const handleChange = (denomination: number, qty: number) => {
    const safeQty = Math.max(0, Math.floor(qty) || 0);
    const updated = { ...quantities, [denomination]: safeQty };
    setQuantities(updated);

    const counts: DenominationCount[] = SRI_LANKAN_DENOMINATIONS.map((d) => ({
      denomination: d.value,
      quantity: updated[d.value] || 0,
    }));
    const total = counts.reduce((sum, c) => sum + c.denomination * c.quantity, 0);
    onChange(counts, total);
  };

  const isCoin = (value: number) => value <= 10;
  const notes = SRI_LANKAN_DENOMINATIONS.filter((d) => !isCoin(d.value));
  const coins = SRI_LANKAN_DENOMINATIONS.filter((d) => isCoin(d.value));

  const notesTotal = notes.reduce(
    (sum, denomination) => sum + denomination.value * (quantities[denomination.value] || 0),
    0,
  );
  const coinsTotal = coins.reduce(
    (sum, denomination) => sum + denomination.value * (quantities[denomination.value] || 0),
    0,
  );
  const warningSet = new Set(warningDenominations);
  const flashSet = new Set(flashDenominations);

  const renderItem = (d: (typeof SRI_LANKAN_DENOMINATIONS)[number], icon: "note" | "coin") => {
    const qty = quantities[d.value] || 0;
    const isWarning = warningSet.has(d.value);
    const isFlash = flashSet.has(d.value);
    const controlButtonClass = compact
      ? "h-9 w-9 rounded-lg border border-slate-300 bg-slate-50 text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
      : "h-9 w-9 rounded-lg border border-slate-300 bg-slate-50 text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60";
    const incrementButtonClass = compact
      ? "h-9 w-9 rounded-lg border border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
      : "h-9 w-9 rounded-lg border border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90";
    const quantityInputClass = compact
      ? "h-8 w-[3rem] rounded-md border border-slate-300 bg-white px-1.5 text-center text-[0.85rem] font-medium tabular-nums text-slate-700 outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
      : "h-9 w-[3.5rem] rounded-md border border-slate-300 bg-white px-2 text-center text-sm font-medium tabular-nums text-slate-700 outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20";

    return (
      <div
        key={d.value}
        className={`grid grid-cols-[minmax(0,1fr),auto] items-center ${compact ? "gap-1 px-0 py-[1px]" : "gap-2 rounded-xl px-0.5 py-1"}`}
      >
        <div className={`flex min-w-0 items-center justify-between ${compact ? "gap-1" : "gap-2"}`}>
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={`flex shrink-0 items-center justify-center text-slate-500 ${compact ? "h-3 w-3" : "h-4 w-4"}`}
              aria-hidden="true"
            >
              {icon === "note" ? <Banknote className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} /> : <Coins className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />}
            </span>
            <span
              className={`truncate font-semibold leading-none tracking-tight text-slate-700 ${compact ? "text-[0.8rem]" : "text-[1rem]"}`}
            >
              Rs.{d.label}
            </span>
          </div>

          <div className={`flex items-center ${compact ? "gap-0.5" : "gap-1.5"}`}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleChange(d.value, qty - 1)}
              disabled={qty <= 0}
              className={controlButtonClass}
              aria-label={`Decrease ${d.label}`}
            >
              <Minus className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </Button>

            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={qty}
              onChange={(event) => handleChange(d.value, Number(event.target.value))}
              className={quantityInputClass}
              aria-label={`${d.label} quantity`}
            />

            <Button
              type="button"
              variant="pos-primary"
              size="icon"
              onClick={() => handleChange(d.value, qty + 1)}
              className={incrementButtonClass}
              aria-label={`Increase ${d.label}`}
            >
              <Plus className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </Button>

            <span
              className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums text-white transition-all ${
                isFlash
                  ? `animate-pulse bg-amber-500 ring-2 ring-amber-200 ${compact ? "h-[18px] min-w-[18px] px-1" : "h-5 min-w-5 px-1"}`
                  : isWarning
                  ? `animate-pulse bg-red-600 ring-2 ring-red-300 ${compact ? "h-[18px] min-w-[18px] px-1" : "h-5 min-w-5 px-1"}`
                  : `bg-red-500 ${compact ? "h-[18px] min-w-[18px] px-1" : "h-5 min-w-5 px-1"}`
              }`}
              aria-live="polite"
              aria-atomic="true"
            >
              {qty}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[#f7f8fa]">
      <div className={compact ? "grid min-h-0 flex-1 grid-cols-1 divide-y divide-slate-300 md:grid-cols-2 md:divide-x md:divide-y-0" : "grid min-h-0 flex-1 grid-cols-1 divide-y divide-slate-300 md:grid-cols-2 md:divide-x md:divide-y-0"}>
        <section className={`flex min-h-0 h-full flex-col ${compact ? "p-1.5" : "p-3"}`}>
          <div className={`flex items-center justify-between ${compact ? "mb-1" : "mb-2.5"}`}>
            <div className="flex items-center gap-2">
              <Banknote className={compact ? "h-3.5 w-3.5 text-slate-500" : "h-4 w-4 text-slate-500"} />
              <h3 className={`font-medium uppercase tracking-[0.18em] text-slate-600 ${compact ? "text-[11px]" : "text-xs"}`}>Notes</h3>
            </div>
            <span className={`font-medium text-slate-500 ${compact ? "text-[11px]" : "text-xs"}`}>
              {notes.length} items - Rs.{notesTotal.toLocaleString()}
            </span>
          </div>

          <div className={`grid auto-rows-min content-start grid-cols-1 ${compact ? "flex-1 min-h-0 gap-0.5 overflow-y-auto pr-0.5" : "flex-1 min-h-0 gap-0.5 overflow-y-auto pr-1"}`}>
            {notes.map((d) => renderItem(d, "note"))}
          </div>
        </section>

        <section className={`flex min-h-0 h-full flex-col ${compact ? "p-1.5" : "p-3"}`}>
          <div className={`flex items-center justify-between ${compact ? "mb-1" : "mb-2.5"}`}>
            <div className="flex items-center gap-2">
              <Coins className={compact ? "h-3.5 w-3.5 text-slate-500" : "h-4 w-4 text-slate-500"} />
              <h3 className={`font-medium uppercase tracking-[0.18em] text-slate-600 ${compact ? "text-[11px]" : "text-xs"}`}>Coins</h3>
            </div>
            <span className={`font-medium text-slate-500 ${compact ? "text-[11px]" : "text-xs"}`}>
              {coins.length} items - Rs.{coinsTotal.toLocaleString()}
            </span>
          </div>

          <div className={`grid auto-rows-min content-start grid-cols-1 ${compact ? "flex-1 min-h-0 gap-0.5 overflow-y-auto pr-0.5" : "flex-1 min-h-0 gap-0.5 overflow-y-auto pr-1"}`}>
            {coins.map((d) => renderItem(d, "coin"))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DenominationCounter;
