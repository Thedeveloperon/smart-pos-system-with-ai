import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CheckoutPanel, { type CheckoutPanelHandle } from "./CheckoutPanel";
import type { CartItem } from "./types";

vi.mock("@/lib/sound", () => ({
  primeConfirmationSound: vi.fn().mockResolvedValue(undefined),
  playSaleCompleteSound: vi.fn().mockResolvedValue(undefined),
  playCashCountSound: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  window.localStorage.clear();
});

const sampleItems: CartItem[] = [
  {
    product: {
      id: "prod-1",
      name: "Rice 5kg",
      sku: "RICE-5KG",
      price: 100,
      stock: 20,
    },
    quantity: 1,
  },
];

describe("CheckoutPanel shortcut integration", () => {
  it("blocks complete sale when cart is empty", () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={[]}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        showShortcutHints
      />,
    );

    const result = panelRef.current?.tryCompleteSale();
    expect(result).toEqual({ ok: false, reason: "add items to the cart" });
    expect(onCompleteSale).not.toHaveBeenCalled();
  });

  it("blocks cash complete when received amount is insufficient", () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        showShortcutHints
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "50" } });

    const result = panelRef.current?.tryCompleteSale();
    expect(result).toEqual({
      ok: false,
      reason: "cash received is less than the grand total",
    });
    expect(onCompleteSale).not.toHaveBeenCalled();
  });

  it("completes sale successfully for card flow via shortcut method", () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        showShortcutHints
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Card" }));

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });
    expect(result).toEqual({ ok: true });
    expect(onCompleteSale).toHaveBeenCalledWith("card", 0, "", [], []);
  });

  it("quick sale cash button pre-fills the exact grand total", () => {
    window.localStorage.setItem("smartpos-quick-sale-enabled", "true");
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        showShortcutHints
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Cash \(F8\)/ }));

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });

    expect(result).toEqual({ ok: true });
    expect(onCompleteSale).toHaveBeenCalledWith("cash", 100, "", [], []);
  });

  it("opens a change breakdown dialog before completing a cash sale", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        showShortcutHints
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: /Complete Sale \(F9\)/ }));

    expect(onCompleteSale).not.toHaveBeenCalled();
    expect(await screen.findByText("Change breakdown")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Proceed - Rs. 50" }));

    expect(onCompleteSale).toHaveBeenCalledWith("cash", 150, "", [], expect.any(Array));
  });

  it("opens cash workflow dialog through imperative shortcut action", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        onCompleteSale={vi.fn()}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        showShortcutHints
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    act(() => {
      panelRef.current?.openCashWorkflow();
    });

    expect(await screen.findByText("Count Cash Received")).toBeInTheDocument();
  });
});
