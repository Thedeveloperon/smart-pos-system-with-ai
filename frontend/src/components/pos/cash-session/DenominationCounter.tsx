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

  const cardClass = (qty: number) =>
    `flex min-h-[4rem] flex-col justify-center rounded-2xl border px-2 py-0 shadow-sm transition-all duration-150 ${
      qty > 0
        ? "border-primary/25 bg-primary/5 shadow-[0_6px_18px_rgba(16,185,129,0.08)]"
        : "border-border/70 bg-card hover:border-border hover:bg-muted/20"
    }`;

  const quantityClass = (qty: number) => {
    if (qty <= 5) {
      return "inline-flex min-w-10 items-center justify-center rounded-full bg-amber-500 px-3 py-1 text-sm font-black tabular-nums text-white shadow-sm";
    }

    if (qty <= 10) {
      return "inline-flex min-w-10 items-center justify-center rounded-full bg-emerald-500 px-3 py-1 text-sm font-black tabular-nums text-white shadow-sm";
    }

    return "inline-flex min-w-10 items-center justify-center rounded-full bg-rose-500 px-3 py-1 text-sm font-black tabular-nums text-white shadow-sm";
  };

  const renderItem = (d: (typeof SRI_LANKAN_DENOMINATIONS)[number], icon: "note" | "coin") => {
    const qty = quantities[d.value] || 0;

    return (
      <div key={d.value} className={cardClass(qty)}>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => handleChange(d.value, qty - 1)}
            disabled={qty <= 0}
            className="h-9 w-9 shrink-0 rounded-xl border-2 border-rose-200 bg-rose-50 text-rose-600 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus-visible:ring-rose-300 disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            aria-label={`Decrease ${d.label}`}
          >
            <Minus className="h-4 w-4" />
          </Button>

          <div className="flex min-w-0 items-center justify-center gap-1.5 justify-self-center">
            <div className="flex min-w-0 items-center gap-1">
              <span
                className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md ${
                  icon === "note" ? "text-sky-600" : "text-amber-600"
                }`}
                aria-hidden="true"
              >
                {icon === "note" ? <Banknote className="h-3 w-3" /> : <Coins className="h-3 w-3" />}
              </span>
              <span className="text-[1.2rem] font-extrabold tracking-tight text-foreground">Rs.{d.label}</span>
            </div>

            <div className={`${quantityClass(qty)} min-w-8 px-2 py-0.5 text-xs`} aria-live="polite" aria-atomic="true">
              {qty}
            </div>
          </div>

          <Button
            type="button"
            variant="pos-primary"
            size="icon"
            onClick={() => handleChange(d.value, qty + 1)}
            className="h-9 w-9 shrink-0 rounded-xl border-2 border-primary bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary/90 focus-visible:ring-primary/40"
            aria-label={`Increase ${d.label}`}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch md:gap-2 lg:gap-3">
        <section className="flex min-h-0 flex-col self-stretch rounded-3xl border border-border/70 bg-background/70 p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-muted-foreground">Notes</h3>
            </div>
            <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {notes.length} items
            </span>
          </div>

          <div className="grid flex-1 min-h-0 auto-rows-min content-start grid-cols-1 gap-1.5 overflow-hidden pr-1 sm:pr-0">
            {notes.map((d) => renderItem(d, "note"))}
          </div>
        </section>

        <section className="flex min-h-0 flex-col self-stretch rounded-3xl border border-border/70 bg-background/70 p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-muted-foreground">Coins</h3>
            </div>
            <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {coins.length} items
            </span>
          </div>

          <div className="grid flex-1 min-h-0 auto-rows-min content-start grid-cols-1 gap-1.5 overflow-hidden pr-1 sm:pr-0">
            {coins.map((d) => renderItem(d, "coin"))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DenominationCounter;
