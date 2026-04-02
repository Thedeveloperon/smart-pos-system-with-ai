import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Banknote, Coins, Minus, Plus } from "lucide-react";
import { SRI_LANKAN_DENOMINATIONS, type DenominationCount } from "./types";

interface DenominationCounterProps {
  onChange: (counts: DenominationCount[], total: number) => void;
  initialCounts?: DenominationCount[];
}

const DenominationCounter = ({ onChange, initialCounts }: DenominationCounterProps) => {
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

  const renderItem = (d: (typeof SRI_LANKAN_DENOMINATIONS)[number], icon: "note" | "coin") => {
    const qty = quantities[d.value] || 0;

    return (
      <div key={d.value} className="grid grid-cols-[minmax(0,1fr),auto] items-center gap-2 rounded-xl px-0.5 py-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                icon === "note" ? "text-slate-500" : "text-slate-500"
              }`}
              aria-hidden="true"
            >
              {icon === "note" ? <Banknote className="h-3 w-3" /> : <Coins className="h-3 w-3" />}
            </span>
            <span className="truncate text-[1rem] font-semibold leading-none tracking-tight text-slate-700">
              Rs.{d.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleChange(d.value, qty - 1)}
              disabled={qty <= 0}
              className="h-9 w-9 rounded-lg border border-slate-300 bg-slate-50 text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
              aria-label={`Decrease ${d.label}`}
            >
              <Minus className="h-4 w-4" />
            </Button>

            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={qty}
              onChange={(event) => handleChange(d.value, Number(event.target.value))}
              className="h-9 w-[3.5rem] rounded-md border border-slate-300 bg-white px-2 text-center text-sm font-medium tabular-nums text-slate-700 outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              aria-label={`${d.label} quantity`}
            />

            <Button
              type="button"
              variant="pos-primary"
              size="icon"
              onClick={() => handleChange(d.value, qty + 1)}
              className="h-9 w-9 rounded-lg border border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
              aria-label={`Increase ${d.label}`}
            >
              <Plus className="h-4 w-4" />
            </Button>

            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold tabular-nums text-white"
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[#f7f8fa]">
      <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-slate-300 md:grid-cols-2 md:divide-x md:divide-y-0">
        <section className="flex min-h-0 h-full flex-col p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-slate-500" />
              <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-slate-600">Notes</h3>
            </div>
            <span className="text-xs font-medium text-slate-500">
              {notes.length} items - Rs.{notesTotal.toLocaleString()}
            </span>
          </div>

          <div className="grid flex-1 min-h-0 auto-rows-min content-start grid-cols-1 gap-0.5 overflow-y-auto pr-1">
            {notes.map((d) => renderItem(d, "note"))}
          </div>
        </section>

        <section className="flex min-h-0 h-full flex-col p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-slate-500" />
              <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-slate-600">Coins</h3>
            </div>
            <span className="text-xs font-medium text-slate-500">
              {coins.length} items - Rs.{coinsTotal.toLocaleString()}
            </span>
          </div>

          <div className="grid flex-1 min-h-0 auto-rows-min content-start grid-cols-1 gap-0.5 overflow-y-auto pr-1">
            {coins.map((d) => renderItem(d, "coin"))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DenominationCounter;
