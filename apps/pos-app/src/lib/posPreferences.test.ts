import { describe, expect, it, beforeEach } from "vitest";
import {
  isExpertModeEnabled,
  isQuickSaleEnabled,
  setExpertModeEnabled,
  setQuickSaleEnabled,
} from "./posPreferences";

describe("posPreferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists quick sale and expert mode toggles", () => {
    expect(isQuickSaleEnabled()).toBe(false);
    expect(isExpertModeEnabled()).toBe(false);

    setQuickSaleEnabled(true);
    setExpertModeEnabled(true);

    expect(isQuickSaleEnabled()).toBe(true);
    expect(isExpertModeEnabled()).toBe(true);

    setQuickSaleEnabled(false);
    setExpertModeEnabled(false);

    expect(isQuickSaleEnabled()).toBe(false);
    expect(isExpertModeEnabled()).toBe(false);
  });
});
