import { SRI_LANKAN_DENOMINATIONS, type DenominationCount } from "./types";

export function buildChangeBreakdown(
  changeAmount: number,
  availableCounts: DenominationCount[] = []
): DenominationCount[] {
  let remaining = Math.max(0, Math.round(changeAmount));
  const availableByDenomination = new Map(availableCounts.map((count) => [count.denomination, count.quantity]));

  return [...SRI_LANKAN_DENOMINATIONS]
    .sort((left, right) => right.value - left.value)
    .map((denomination) => {
      const available = availableByDenomination.get(denomination.value) ?? Number.POSITIVE_INFINITY;
      const quantity = Math.min(Math.floor(remaining / denomination.value), available);
      remaining -= quantity * denomination.value;

      return {
        denomination: denomination.value,
        quantity,
      };
    })
    .sort((left, right) => right.denomination - left.denomination);
}

export function splitChangeBreakdown(counts: DenominationCount[]) {
  const notes = counts.filter((count) => count.denomination > 10 && count.quantity > 0);
  const coins = counts.filter((count) => count.denomination <= 10 && count.quantity > 0);

  return { notes, coins };
}

export type DenominationShortage = {
  denomination: number;
  selectedQuantity: number;
  availableQuantity: number;
  shortage: number;
};

export function getDenominationShortages(
  selectedCounts: DenominationCount[],
  availableCounts: DenominationCount[] = [],
): DenominationShortage[] {
  if (availableCounts.length === 0) {
    return [];
  }

  const availableByDenomination = new Map(
    availableCounts.map((count) => [count.denomination, count.quantity]),
  );

  return selectedCounts
    .map((count) => {
      const availableQuantity = availableByDenomination.get(count.denomination) ?? 0;
      const shortage = count.quantity - availableQuantity;

      if (shortage <= 0) {
        return null;
      }

      return {
        denomination: count.denomination,
        selectedQuantity: count.quantity,
        availableQuantity,
        shortage,
      };
    })
    .filter((value): value is DenominationShortage => value !== null);
}
