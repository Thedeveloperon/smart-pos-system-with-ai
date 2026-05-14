import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePosShortcuts } from "./usePosShortcuts";

interface HarnessProps {
  enabled?: boolean;
  actionsEnabled?: boolean;
  onFocusSearch?: () => void;
  onHoldBill?: () => void;
  onOpenCashWorkflow?: () => void;
  onCompleteSale?: () => void;
  onOpenHelp?: () => void;
  onEscape?: () => void;
}

const HookHarness = ({
  enabled = true,
  actionsEnabled = true,
  onFocusSearch = () => {},
  onHoldBill = () => {},
  onOpenCashWorkflow = () => {},
  onCompleteSale = () => {},
  onOpenHelp = () => {},
  onEscape = () => {},
}: HarnessProps) => {
  usePosShortcuts({
    enabled,
    actionsEnabled,
    onFocusSearch,
    onHoldBill,
    onOpenCashWorkflow,
    onCompleteSale,
    onOpenHelp,
    onEscape,
  });

  return (
    <div>
      <input aria-label="typing-input" />
      <textarea aria-label="typing-area" />
    </div>
  );
};

describe("usePosShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("fires action shortcuts when enabled", () => {
    const onFocusSearch = vi.fn();
    const onHoldBill = vi.fn();
    const onOpenCashWorkflow = vi.fn();
    const onCompleteSale = vi.fn();

    render(
      <HookHarness
        onFocusSearch={onFocusSearch}
        onHoldBill={onHoldBill}
        onOpenCashWorkflow={onOpenCashWorkflow}
        onCompleteSale={onCompleteSale}
      />,
    );

    fireEvent.keyDown(window, { key: "F2" });
    fireEvent.keyDown(window, { key: "F4" });
    fireEvent.keyDown(window, { key: "F8" });
    fireEvent.keyDown(window, { key: "F9" });

    expect(onFocusSearch).toHaveBeenCalledTimes(1);
    expect(onHoldBill).toHaveBeenCalledTimes(1);
    expect(onOpenCashWorkflow).toHaveBeenCalledTimes(1);
    expect(onCompleteSale).toHaveBeenCalledTimes(1);
  });

  it("does not fire action shortcuts while typing in input controls", () => {
    const onFocusSearch = vi.fn();
    const onHoldBill = vi.fn();
    const onOpenCashWorkflow = vi.fn();
    const onCompleteSale = vi.fn();

    render(
      <HookHarness
        onFocusSearch={onFocusSearch}
        onHoldBill={onHoldBill}
        onOpenCashWorkflow={onOpenCashWorkflow}
        onCompleteSale={onCompleteSale}
      />,
    );

    const input = screen.getByLabelText("typing-input");
    const textArea = screen.getByLabelText("typing-area");

    fireEvent.keyDown(input, { key: "F2" });
    fireEvent.keyDown(input, { key: "F4" });
    fireEvent.keyDown(textArea, { key: "F8" });
    fireEvent.keyDown(textArea, { key: "F9" });

    expect(onFocusSearch).not.toHaveBeenCalled();
    expect(onHoldBill).not.toHaveBeenCalled();
    expect(onOpenCashWorkflow).not.toHaveBeenCalled();
    expect(onCompleteSale).not.toHaveBeenCalled();
  });

  it("keeps help and escape active even when actions are disabled", () => {
    const onOpenHelp = vi.fn();
    const onEscape = vi.fn();
    const onFocusSearch = vi.fn();

    render(
      <HookHarness
        actionsEnabled={false}
        onOpenHelp={onOpenHelp}
        onEscape={onEscape}
        onFocusSearch={onFocusSearch}
      />,
    );

    fireEvent.keyDown(window, { key: "F1" });
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "F2" });

    expect(onOpenHelp).toHaveBeenCalledTimes(2);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onFocusSearch).not.toHaveBeenCalled();
  });

  it("ignores repeated action keydown events", () => {
    const onCompleteSale = vi.fn();

    render(<HookHarness onCompleteSale={onCompleteSale} />);

    fireEvent.keyDown(window, { key: "F9", repeat: true });
    fireEvent.keyDown(window, { key: "F9", repeat: false });

    expect(onCompleteSale).toHaveBeenCalledTimes(1);
  });

  it("ignores action shortcuts with modifier keys", () => {
    const onFocusSearch = vi.fn();

    render(<HookHarness onFocusSearch={onFocusSearch} />);

    fireEvent.keyDown(window, { key: "F2", ctrlKey: true });
    fireEvent.keyDown(window, { key: "F2", metaKey: true });
    fireEvent.keyDown(window, { key: "F2", altKey: true });

    expect(onFocusSearch).not.toHaveBeenCalled();
  });
});
