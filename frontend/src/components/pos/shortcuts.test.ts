import { describe, expect, it } from "vitest";
import { POS_SHORTCUT_INLINE_HINT, POS_SHORTCUT_LABELS, POS_SHORTCUTS } from "./shortcuts";

describe("POS shortcuts config", () => {
  it("defines the expected cashier shortcut keys", () => {
    const keys = POS_SHORTCUTS.map((shortcut) => shortcut.key);
    expect(keys).toEqual(["F2", "F4", "F8", "F9", "F1 or ?"]);
  });

  it("keeps labels aligned with primary actions", () => {
    expect(POS_SHORTCUT_LABELS.focusSearch).toBe("F2");
    expect(POS_SHORTCUT_LABELS.holdBill).toBe("F4");
    expect(POS_SHORTCUT_LABELS.openCashWorkflow).toBe("F8");
    expect(POS_SHORTCUT_LABELS.completeSale).toBe("F9");
    expect(POS_SHORTCUT_LABELS.openHelp).toBe("F1/?");
  });

  it("documents all primary keys in inline hint text", () => {
    expect(POS_SHORTCUT_INLINE_HINT).toContain("F2");
    expect(POS_SHORTCUT_INLINE_HINT).toContain("F4");
    expect(POS_SHORTCUT_INLINE_HINT).toContain("F8");
    expect(POS_SHORTCUT_INLINE_HINT).toContain("F9");
    expect(POS_SHORTCUT_INLINE_HINT).toContain("F1");
  });
});
