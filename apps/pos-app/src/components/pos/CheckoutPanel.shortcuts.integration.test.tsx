import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutPanel, { type CheckoutPanelHandle } from "./CheckoutPanel";
import type { CartItem } from "./types";
import type { CashDrawerState } from "./cash-session/types";
import { fetchCustomerDirectoryLookup, fetchCustomerPriceTiers } from "@/lib/api";

vi.mock("@/lib/sound", () => ({
  primeConfirmationSound: vi.fn().mockResolvedValue(undefined),
  playSaleCompleteSound: vi.fn().mockResolvedValue(undefined),
  playCashCountSound: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchCustomerDirectoryLookup: vi.fn(),
    fetchCustomerPriceTiers: vi.fn(),
    createCustomer: vi.fn(),
  };
});

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

const sampleCashDrawer: CashDrawerState = {
  counts: [
    { denomination: 50, quantity: 1 },
    { denomination: 20, quantity: 0 },
    { denomination: 10, quantity: 0 },
    { denomination: 5, quantity: 0 },
    { denomination: 2, quantity: 0 },
    { denomination: 1, quantity: 0 },
  ],
  total: 50,
};

const mockFetchCustomerDirectoryLookup = vi.mocked(fetchCustomerDirectoryLookup);
const mockFetchCustomerPriceTiers = vi.mocked(fetchCustomerPriceTiers);
const emptyCashierDiscount = {
  cashierTransactionDiscountPercent: 0,
  cashierTransactionDiscountFixed: null,
};

beforeEach(() => {
  mockFetchCustomerDirectoryLookup.mockResolvedValue([
    {
      id: "customer-default",
      name: "Default Customer",
      code: "C-0000",
      phone: "0711111111",
      creditLimit: 0,
      outstandingBalance: 0,
    },
    {
      id: "customer-credit",
      name: "Jagath Bandara",
      code: "C-0007",
      phone: "0712424204",
      creditLimit: 500,
      outstandingBalance: 100,
    },
    {
      id: "customer-low-credit",
      name: "Low Credit",
      code: "C-0008",
      phone: "0700000000",
      creditLimit: 120,
      outstandingBalance: 80,
    },
  ]);
  mockFetchCustomerPriceTiers.mockResolvedValue([]);
});

async function waitForDefaultCustomer() {
  await waitFor(() => expect(screen.getByText("0711111111")).toBeInTheDocument());
}

async function selectCustomer(query: string, name: RegExp) {
  fireEvent.change(screen.getByPlaceholderText("Search name, code, phone, email..."), { target: { value: query } });
  fireEvent.click(await screen.findByRole("button", { name }));
}

describe("CheckoutPanel shortcut integration", () => {
  it("blocks complete sale when cart is empty", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={[]}
        cashDrawer={sampleCashDrawer}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });
    expect(result).toEqual({ ok: false, reason: "add items to the cart" });
    expect(onCompleteSale).not.toHaveBeenCalled();
  });

  it("blocks cash complete when received amount is insufficient", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        cashDrawer={sampleCashDrawer}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "50" } });

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });
    expect(result).toEqual({
      ok: false,
      reason: "cash received is less than the grand total",
    });
    expect(onCompleteSale).not.toHaveBeenCalled();
  });

  it("completes sale successfully for card flow via shortcut method", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        cashDrawer={sampleCashDrawer}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    fireEvent.click(screen.getByRole("button", { name: "Card" }));

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });
    expect(result).toEqual({ ok: true });
    expect(onCompleteSale).toHaveBeenCalledWith("card", 0, "customer-default", emptyCashierDiscount, [], [], false, 0);
  });

  it("quick sale cash button pre-fills the exact grand total", async () => {
    window.localStorage.setItem("smartpos-quick-sale-enabled", "true");
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        cashDrawer={sampleCashDrawer}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    fireEvent.click(screen.getByRole("button", { name: /Cash \(F8\)/ }));

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });

    expect(result).toEqual({ ok: true });
    expect(onCompleteSale).toHaveBeenCalledWith("cash", 100, "customer-default", emptyCashierDiscount, [], [], false, 0);
  });

  it("opens a change breakdown dialog before completing a cash sale", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        cashDrawer={sampleCashDrawer}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: /Complete Sale \(F9\)/ }));

    expect(onCompleteSale).not.toHaveBeenCalled();
    expect(await screen.findByText("Change breakdown")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Proceed - Rs. 50" }));

    expect(onCompleteSale).toHaveBeenCalledWith("cash", 150, "customer-default", emptyCashierDiscount, [], expect.any(Array), false, 0);
  });

  it("marks custom payout sales when the override is enabled", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
        allowCustomPayout
      />,
    );

    await waitForDefaultCustomer();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: /Complete Sale \(F9\)/ }));
    expect(await screen.findByText("Change breakdown")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Enable custom payout"));
    expect(await screen.findByText(/Selected total: Rs\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Proceed - Rs. 50" }));

    expect(onCompleteSale).toHaveBeenCalledWith("cash", 150, "customer-default", emptyCashierDiscount, [], expect.any(Array), true, 50);
  });

  it("opens cash workflow dialog through imperative shortcut action", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        cashDrawer={sampleCashDrawer}
        onCompleteSale={vi.fn()}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    act(() => {
      panelRef.current?.openCashWorkflow();
    });

    expect(await screen.findByText("Count Cash Received")).toBeInTheDocument();
  });

  it("blocks credit sales when only the default customer is selected", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        cashDrawer={sampleCashDrawer}
        onCompleteSale={vi.fn()}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    fireEvent.click(screen.getByRole("button", { name: "Credit" }));

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });
    expect(result).toEqual({ ok: false, reason: "select a customer for credit sales" });
    expect(screen.getByText("Select a customer with a credit profile to complete this sale on credit.")).toBeInTheDocument();
  });

  it("completes credit sales for customers with enough available credit", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        cashDrawer={sampleCashDrawer}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    await selectCustomer("Jagath", /Jagath Bandara/i);
    fireEvent.click(screen.getByRole("button", { name: "Credit" }));
    expect(screen.getByText("Jagath Bandara")).toBeInTheDocument();
    expect(screen.getByText(/Available:/)).toBeInTheDocument();

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });
    expect(result).toEqual({ ok: true });
    expect(onCompleteSale).toHaveBeenCalledWith("credit", 0, "customer-credit", emptyCashierDiscount, [], [], false, 0);
  });

  it("blocks credit sales when the selected customer exceeds the credit limit", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        cashDrawer={sampleCashDrawer}
        onCompleteSale={vi.fn()}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    await selectCustomer("Low Credit", /Low Credit/i);
    fireEvent.click(screen.getByRole("button", { name: "Credit" }));

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });
    expect(result).toEqual({ ok: false, reason: "selected customer does not have enough available credit" });
  });

  it("shows cashier role cap hint and clamps transaction percent input", async () => {
    const onCartDiscountChange = vi.fn();

    render(
      <CheckoutPanel
        items={sampleItems}
        role="cashier"
        cashDrawer={sampleCashDrawer}
        onCompleteSale={vi.fn()}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{}}
        onCartDiscountChange={onCartDiscountChange}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    expect(screen.getByText("Max 10% for your role")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("%"), { target: { value: "30" } });
    expect(onCartDiscountChange).toHaveBeenCalledWith({
      cashierTransactionDiscountPercent: 10,
      cashierTransactionDiscountFixed: null,
    });
  });

  it("clamps over-cap cashier transaction percent before completing", async () => {
    const panelRef = createRef<CheckoutPanelHandle>();
    const onCompleteSale = vi.fn();

    render(
      <CheckoutPanel
        ref={panelRef}
        items={sampleItems}
        role="cashier"
        cashDrawer={sampleCashDrawer}
        onCompleteSale={onCompleteSale}
        onHoldBill={vi.fn()}
        onCancelSale={vi.fn()}
        cartDiscount={{ cashierTransactionDiscountPercent: 30 }}
        onCartDiscountChange={vi.fn()}
        showShortcutHints
      />,
    );

    await waitForDefaultCustomer();
    fireEvent.click(screen.getByRole("button", { name: "Card" }));

    let result;
    act(() => {
      result = panelRef.current?.tryCompleteSale();
    });
    expect(result).toEqual({ ok: true });
    expect(onCompleteSale).toHaveBeenCalledWith(
      "card",
      0,
      "customer-default",
      {
        cashierTransactionDiscountPercent: 10,
        cashierTransactionDiscountFixed: null,
      },
      [],
      [],
      false,
      0,
    );
  });
});


