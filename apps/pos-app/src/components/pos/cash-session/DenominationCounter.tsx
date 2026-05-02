import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Banknote, Coins, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SRI_LANKAN_DENOMINATIONS, type Denomination, type DenominationCount } from "./types";

interface DenominationCounterProps {
  onChange: (counts: DenominationCount[], total: number) => void;
  initialCounts?: DenominationCount[];
  compact?: boolean;
  warningDenominations?: number[];
  flashDenominations?: number[];
  variant?: "standard" | "visual";
}

const DenominationCounter = ({
  onChange,
  initialCounts,
  compact = false,
  warningDenominations = [],
  flashDenominations = [],
  variant = "standard",
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

  const notes = SRI_LANKAN_DENOMINATIONS.filter((d) => d.kind === "note");
  const coins = SRI_LANKAN_DENOMINATIONS.filter((d) => d.kind === "coin");

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

  const renderStandardItem = (d: Denomination, icon: "note" | "coin") => {
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
              aria-label={`Decrease ${d.value}`}
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
              aria-label={`${d.value} quantity`}
            />

            <Button
              type="button"
              variant="pos-primary"
              size="icon"
              onClick={() => handleChange(d.value, qty + 1)}
              className={incrementButtonClass}
              aria-label={`Increase ${d.value}`}
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

  const renderVisualItem = (d: Denomination) => {
    const qty = quantities[d.value] || 0;
    const itemTotal = d.value * qty;
    const isWarning = warningSet.has(d.value);
    const isFlash = flashSet.has(d.value);
    const amountBadgeClass = isFlash
      ? "border-amber-300 bg-amber-50 text-amber-700 ring-2 ring-amber-200 animate-pulse"
      : isWarning
        ? "border-red-300 bg-red-50 text-red-700 ring-2 ring-red-200 animate-pulse"
        : "border-slate-200 bg-slate-50 text-slate-700";

    return (
      <div
        key={d.value}
        className={cn(
          "grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-colors md:grid-cols-[minmax(0,1fr),auto]",
          isFlash && "border-amber-300 bg-amber-50/40",
          isWarning && "border-red-200 bg-red-50/40",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white shadow-sm",
              d.kind === "note" ? "h-16 w-24 rounded-2xl p-1.5" : "h-16 w-16 rounded-full p-1.5",
            )}
          >
            <img
              src={d.imagePath}
              alt={`Sri Lankan Rs. ${d.label} ${d.kind}`}
              className={cn(
                "object-contain",
                d.kind === "note" ? "h-full w-full" : "h-14 w-14",
              )}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold leading-none tracking-tight text-slate-900 sm:text-xl">
                Rs.{d.label}
              </p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {d.kind}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Use the controls to count each {d.kind} received from the customer.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => handleChange(d.value, qty - 1)}
            disabled={qty <= 0}
            className="h-11 w-11 rounded-xl border-slate-200 bg-white text-slate-500 shadow-none hover:bg-slate-50 hover:text-slate-800"
            aria-label={`Decrease ${d.value}`}
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
            className="h-11 w-[4.5rem] rounded-xl border border-slate-200 bg-white px-2 text-center text-base font-semibold tabular-nums text-slate-900 outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            aria-label={`${d.value} quantity`}
          />

          <Button
            type="button"
            variant="pos-primary"
            size="icon"
            onClick={() => handleChange(d.value, qty + 1)}
            className="h-11 w-11 rounded-xl border border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
            aria-label={`Increase ${d.value}`}
          >
            <Plus className="h-4 w-4" />
          </Button>

          <span
            className={cn(
              "inline-flex min-w-[7.25rem] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold tabular-nums transition-all",
              amountBadgeClass,
            )}
            aria-live="polite"
            aria-atomic="true"
          >
            Rs. {itemTotal.toLocaleString()}
          </span>
        </div>
      </div>
    );
  };

  const renderVisualSection = (
    title: string,
    items: Denomination[],
    total: number,
    Icon: typeof Banknote,
  ) => (
    <section className="flex min-h-0 flex-col rounded-[1.75rem] border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              {title}
            </h3>
            <p className="text-xs text-slate-500">Sri Lankan denominations</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-slate-600">{items.length} items</p>
          <p className="text-xs tabular-nums text-slate-500">Rs. {total.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {items.map((denomination) => renderVisualItem(denomination))}
      </div>
    </section>
  );

  if (variant === "visual") {
    return (
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        {renderVisualSection("Notes", notes, notesTotal, Banknote)}
        {renderVisualSection("Coins", coins, coinsTotal, Coins)}
      </div>
    );
  }

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

          <div
            className={`grid auto-rows-min content-start grid-cols-1 ${
              compact
                ? "flex-1 min-h-0 gap-0.5 overflow-y-scroll scrollbar-thin pr-0.5"
                : "flex-1 min-h-0 gap-0.5 overflow-y-scroll scrollbar-thin pr-1"
            }`}
          >
            {notes.map((d) => renderStandardItem(d, "note"))}
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

          <div
            className={`grid auto-rows-min content-start grid-cols-1 ${
              compact
                ? "flex-1 min-h-0 gap-0.5 overflow-y-scroll scrollbar-thin pr-0.5"
                : "flex-1 min-h-0 gap-0.5 overflow-y-scroll scrollbar-thin pr-1"
            }`}
          >
            {coins.map((d) => renderStandardItem(d, "coin"))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DenominationCounter;
