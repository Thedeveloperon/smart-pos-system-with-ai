import { describe, expect, it } from "vitest";
import { getOptionalPayoutSuggestion } from "./changeBreakdown";

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
