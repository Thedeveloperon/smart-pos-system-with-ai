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

function buildIdealChangeBreakdown(changeAmount: number): DenominationCount[] {
  let remaining = Math.max(0, Math.round(changeAmount));

  return ORDERED_DENOMINATIONS.map((denomination) => {
    const quantity = Math.floor(remaining / denomination.value);
    remaining -= quantity * denomination.value;

    return {
      denomination: denomination.value,
      quantity,
    };
  });
}

function describeDenomination(denomination: number) {
  const unit = denomination > 10 ? "notes" : "coins";
  return `Rs.${denomination.toLocaleString()} ${unit}`;
}

function isBetterScore(candidate: [number, number, number], current: [number, number, number] | null) {
  if (!current) {
    return true;
  }

  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] < current[index]) {
      return true;
    }

    if (candidate[index] > current[index]) {
      return false;
    }
  }

  return false;
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

export type DrawerChangeNotice = {
  message: string;
  shortageDenominations: number[];
  suggestion?: OptionalPayoutSuggestion;
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

  const exactSolver = createExactChangeSolver(availableCounts);
  let bestSuggestion: OptionalPayoutSuggestion | null = null;
  let bestScore: [number, number, number] | null = null;

  for (let payoutAmount = normalizedChange + 1; payoutAmount <= drawerTotal; payoutAmount += 1) {
    const breakdown = exactSolver.findExactBreakdown(payoutAmount);
    if (!breakdown) {
      continue;
    }

    const nonZeroDenominations = breakdown.filter((count) => count.quantity > 0).length;
    const requestAmount = payoutAmount - normalizedChange;
    const score: [number, number, number] = [nonZeroDenominations, requestAmount, payoutAmount];

    if (isBetterScore(score, bestScore)) {
      bestScore = score;
      bestSuggestion = {
        requestAmount,
        payoutAmount,
      };
    }
  }

  return bestSuggestion;
}

export function getDrawerChangeNotice(
  changeAmount: number,
  availableCounts: DenominationCount[] = [],
): DrawerChangeNotice | null {
  const normalizedChange = Math.max(0, Math.round(changeAmount));
  if (normalizedChange === 0) {
    return null;
  }

  const idealBreakdown = buildIdealChangeBreakdown(normalizedChange);
  const availableByDenomination = new Map(
    normalizeDenominationCounts(availableCounts).map((count) => [count.denomination, count.quantity]),
  );
  const shortageDenominations = idealBreakdown
    .filter((count) => count.quantity > (availableByDenomination.get(count.denomination) ?? 0))
    .map((count) => count.denomination);

  if (shortageDenominations.length === 0) {
    return null;
  }

  const shortageMessage = shortageDenominations.map((denomination) => describeDenomination(denomination)).join(" and ");
  const suggestion = getDrawerChangeSuggestion(normalizedChange, availableCounts);

  if (!suggestion) {
    return {
      message: `Cash drawer has no ${shortageMessage} available.`,
      shortageDenominations,
    };
  }

  return {
    message: `Cash drawer has no ${shortageMessage} available. Please request an additional Rs.${suggestion.requestAmount.toLocaleString()} from the customer. Then you can return Rs.${suggestion.payoutAmount.toLocaleString()} as the balance.`,
    shortageDenominations,
    suggestion,
  };
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
