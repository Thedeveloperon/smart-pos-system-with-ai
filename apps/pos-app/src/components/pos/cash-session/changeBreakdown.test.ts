import { describe, expect, it } from "vitest";
import {
  getDrawerChangeSuggestion,
  getExactChangeBreakdown,
  getOptionalPayoutSuggestion,
} from "./changeBreakdown";

describe("getOptionalPayoutSuggestion", () => {
  it("suggests a small customer top-up for a round payout", () => {
    expect(getOptionalPayoutSuggestion(40)).toEqual({
      requestAmount: 10,
      payoutAmount: 50,
    });
  });

  it("does not suggest anything for exact round payouts", () => {
    expect(getOptionalPayoutSuggestion(50)).toBeNull();
  });
});

describe("getExactChangeBreakdown", () => {
  it("returns an exact breakdown when the drawer can cover the change", () => {
    const breakdown = getExactChangeBreakdown(40, [
      { denomination: 20, quantity: 2 },
      { denomination: 10, quantity: 0 },
    ]);

    expect(breakdown).toEqual([
      { denomination: 5000, quantity: 0 },
      { denomination: 2000, quantity: 0 },
      { denomination: 1000, quantity: 0 },
      { denomination: 500, quantity: 0 },
      { denomination: 100, quantity: 0 },
      { denomination: 50, quantity: 0 },
      { denomination: 20, quantity: 2 },
      { denomination: 10, quantity: 0 },
      { denomination: 5, quantity: 0 },
      { denomination: 2, quantity: 0 },
      { denomination: 1, quantity: 0 },
    ]);
  });
});

describe("getDrawerChangeSuggestion", () => {
  it("suggests a practical top-up when the drawer cannot make the exact change", () => {
    expect(
      getDrawerChangeSuggestion(40, [
        { denomination: 50, quantity: 1 },
        { denomination: 20, quantity: 0 },
        { denomination: 10, quantity: 1 },
      ]),
    ).toEqual({
      requestAmount: 10,
      payoutAmount: 50,
    });
  });

  it("returns null when there is no feasible payout solution", () => {
    expect(
      getDrawerChangeSuggestion(40, [
        { denomination: 20, quantity: 1 },
      ]),
    ).toBeNull();
  });
});
