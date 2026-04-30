import { SRI_LANKAN_DENOMINATIONS, type DenominationCount } from "./types";

const ORDERED_DENOMINATIONS = [...SRI_LANKAN_DENOMINATIONS].sort((left, right) => right.value - left.value);

export function normalizeDenominationCounts(counts: DenominationCount[] = []): DenominationCount[] {
  const countsByDenomination = new Map(counts.map((count) => [count.denomination, count.quantity]));

  return ORDERED_DENOMINATIONS.map((denomination) => ({
    denomination: denomination.value,
    quantity: countsByDenomination.get(denomination.value) ?? 0,
  }));
}

function createExactChangeSolver(availableCounts: DenominationCount[] = []) {
  const availableByDenomination = new Map(
    normalizeDenominationCounts(availableCounts).map((count) => [count.denomination, count.quantity]),
  );
  const memo = new Map<string, DenominationCount[] | null>();

  const solve = (index: number, remaining: number): DenominationCount[] | null => {
    if (remaining === 0) {
      return ORDERED_DENOMINATIONS.slice(index).map((denomination) => ({
        denomination: denomination.value,
        quantity: 0,
      }));
    }

    if (index >= ORDERED_DENOMINATIONS.length) {
      return null;
    }

    const memoKey = `${index}:${remaining}`;
    if (memo.has(memoKey)) {
      return memo.get(memoKey) ?? null;
    }

    const denomination = ORDERED_DENOMINATIONS[index];
    const available = availableByDenomination.get(denomination.value) ?? 0;
    const maxQuantity = Math.min(Math.floor(remaining / denomination.value), available);

    for (let quantity = maxQuantity; quantity >= 0; quantity -= 1) {
      const nextRemaining = remaining - quantity * denomination.value;
      const tail = solve(index + 1, nextRemaining);

      if (tail) {
        const result = [
          {
            denomination: denomination.value,
            quantity,
          },
          ...tail,
        ];

        memo.set(memoKey, result);
        return result;
      }
    }

    memo.set(memoKey, null);
    return null;
  };

  return {
    findExactBreakdown(amount: number) {
      const normalizedAmount = Math.max(0, Math.round(amount));
      if (normalizedAmount === 0) {
        return normalizeDenominationCounts([]);
      }

      return solve(0, normalizedAmount);
    },
  };
}

export function buildChangeBreakdown(
  changeAmount: number,
  availableCounts: DenominationCount[] = []
): DenominationCount[] {
  const exactSolver = createExactChangeSolver(availableCounts);
  const exactBreakdown = exactSolver.findExactBreakdown(changeAmount);
  if (exactBreakdown) {
    return exactBreakdown;
  }

  let remaining = Math.max(0, Math.round(changeAmount));
  const availableByDenomination = new Map(availableCounts.map((count) => [count.denomination, count.quantity]));

  return [...ORDERED_DENOMINATIONS]
    .map((denomination) => {
      const available = availableByDenomination.get(denomination.value) ?? 0;
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

export type OptionalPayoutSuggestion = {
  requestAmount: number;
  payoutAmount: number;
};

export function getOptionalPayoutSuggestion(changeAmount: number): OptionalPayoutSuggestion | null {
  const normalizedChange = Math.max(0, Math.round(changeAmount));
  if (normalizedChange === 0) {
    return null;
  }

  const payoutAmount = Math.ceil(normalizedChange / 50) * 50;
  if (payoutAmount <= normalizedChange) {
    return null;
  }

  return {
    requestAmount: payoutAmount - normalizedChange,
    payoutAmount,
  };
}

export function getExactChangeBreakdown(
  changeAmount: number,
  availableCounts: DenominationCount[] = [],
): DenominationCount[] | null {
  const exactSolver = createExactChangeSolver(availableCounts);
  return exactSolver.findExactBreakdown(changeAmount);
}

export function getDrawerChangeSuggestion(
  changeAmount: number,
  availableCounts: DenominationCount[] = [],
): OptionalPayoutSuggestion | null {
  const normalizedChange = Math.max(0, Math.round(changeAmount));
  if (normalizedChange === 0) {
    return null;
  }

  if (getExactChangeBreakdown(normalizedChange, availableCounts)) {
    return null;
  }

  const drawerTotal = normalizeDenominationCounts(availableCounts).reduce(
    (sum, count) => sum + count.denomination * count.quantity,
    0,
  );
  if (drawerTotal <= normalizedChange) {
    return null;
  }

  const suggestedPayout = getOptionalPayoutSuggestion(normalizedChange)?.payoutAmount
    ?? Math.ceil((normalizedChange + 1) / 50) * 50;

  const exactSolver = createExactChangeSolver(availableCounts);
  for (let payoutAmount = suggestedPayout; payoutAmount <= drawerTotal; payoutAmount += 1) {
    if (exactSolver.findExactBreakdown(payoutAmount)) {
      return {
        requestAmount: payoutAmount - normalizedChange,
        payoutAmount,
      };
    }
  }

  return null;
}

export function buildTopUpCounts(amount: number): DenominationCount[] {
  let remaining = Math.max(0, Math.round(amount));
  const topUpCounts: DenominationCount[] = [];

  for (const denomination of ORDERED_DENOMINATIONS) {
    const quantity = Math.floor(remaining / denomination.value);
    if (quantity > 0) {
      topUpCounts.push({
        denomination: denomination.value,
        quantity,
      });
      remaining -= quantity * denomination.value;
    }
  }

  return normalizeDenominationCounts(topUpCounts);
}

export function mergeDenominationCounts(
  baseCounts: DenominationCount[],
  additionCounts: DenominationCount[],
): DenominationCount[] {
  const totalByDenomination = new Map<number, number>();

  for (const count of [...baseCounts, ...additionCounts]) {
    totalByDenomination.set(count.denomination, (totalByDenomination.get(count.denomination) ?? 0) + count.quantity);
  }

  return normalizeDenominationCounts(
    [...totalByDenomination.entries()].map(([denomination, quantity]) => ({ denomination, quantity })),
  );
}
