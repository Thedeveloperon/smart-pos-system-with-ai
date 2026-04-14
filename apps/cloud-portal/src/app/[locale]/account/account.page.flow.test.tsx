import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import I18nProvider from "@/i18n/I18nProvider";
import AccountPage from "@/app/[locale]/account/page";

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
}

function normalizeFetchUrl(url: string) {
  const parsed = url.startsWith("http")
    ? new URL(url)
    : new URL(url, "http://localhost");
  return `${parsed.pathname}${parsed.search}`;
}

function resolveRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flushUi() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 1500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }

    await act(async () => {
      await flushUi();
    });
  }

  throw new Error("Condition was not met before timeout.");
}

describe("Account page credentials-only commerce flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/en/account");

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    if (root) {
      await act(async () => {
        root.unmount();
      });
    }

    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it("signs in with credentials and loads commerce panels without device UI", async () => {
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const requestUrl = normalizeFetchUrl(resolveRequestUrl(input));

      if (requestUrl === "/api/account/me") {
        return jsonResponse({ message: "Unauthorized" }, { status: 401 });
      }

      if (requestUrl === "/api/account/login") {
        return jsonResponse({
          user_id: "11111111-1111-1111-1111-111111111111",
          username: "owner",
          full_name: "Store Owner",
          role: "owner",
          session_id: "sess-01",
          shop_id: "33333333-3333-3333-3333-333333333333",
          shop_code: "default",
          expires_at: "2026-04-20T00:00:00Z",
          mfa_verified: true,
          auth_session_version: 1,
        });
      }

      if (requestUrl === "/api/account/products?take=120") {
        return jsonResponse({
          generated_at: "2026-04-13T00:00:00Z",
          count: 1,
          items: [
            {
              product_code: "ai_pack_100",
              product_name: "AI Credit Pack 100",
              product_type: "ai_credit",
              description: "",
              price: 5,
              currency: "USD",
              billing_mode: "one_time",
              validity: null,
              default_quantity_or_credits: 100,
              active: true,
            },
          ],
        });
      }

      if (requestUrl === "/api/account/purchases?take=80") {
        return jsonResponse({
          generated_at: "2026-04-13T00:00:00Z",
          count: 1,
          items: [
            {
              purchase_id: "pur-01",
              order_number: "PO-001",
              shop_code: "default",
              status: "pending_approval",
              items: [],
              total_amount: 5,
              currency: "USD",
              note: null,
              created_at: "2026-04-13T00:00:00Z",
            },
          ],
        });
      }

      if (requestUrl === "/api/account/ai/invoices?take=80") {
        return jsonResponse({
          generated_at: "2026-04-13T00:00:00Z",
          count: 1,
          items: [
            {
              invoice_id: "inv-01",
              invoice_number: "INV-001",
              shop_code: "default",
              pack_code: "ai_pack_100",
              requested_credits: 100,
              amount_due: 5,
              currency: "USD",
              status: "pending",
              created_at: "2026-04-13T00:00:00Z",
              updated_at: "2026-04-13T00:00:00Z",
            },
          ],
        });
      }

      if (requestUrl === "/api/account/ai/wallet") {
        return jsonResponse({
          available_credits: 220,
          updated_at: "2026-04-13T00:00:00Z",
        });
      }

      if (requestUrl === "/api/account/ai/ledger?take=30") {
        return jsonResponse({
          items: [
            {
              entry_type: "credit",
              delta_credits: 100,
              balance_after_credits: 220,
              created_at_utc: "2026-04-13T00:00:00Z",
            },
          ],
        });
      }

      if (requestUrl === "/api/account/ai/payments?take=30") {
        return jsonResponse({
          items: [
            {
              payment_id: "pay-01",
              payment_status: "succeeded",
              payment_method: "card",
              provider: "stripe",
              credits: 100,
              amount: 5,
              currency: "USD",
              external_reference: "ref-01",
              created_at: "2026-04-13T00:00:00Z",
              completed_at: "2026-04-13T00:01:00Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${requestUrl}`);
    });

    await act(async () => {
      root.render(
        <I18nProvider locale="en" messages={{}}>
          <AccountPage />
        </I18nProvider>,
      );
      await flushUi();
    });

    await waitForCondition(() => {
      const signInButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Sign In",
      ) as HTMLButtonElement | undefined;
      return Boolean(signInButton) && !signInButton!.disabled;
    });

    const usernameInput = container.querySelector('input[autocomplete="username"]') as HTMLInputElement | null;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement | null;

    expect(usernameInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();

    await act(async () => {
      setInputValue(usernameInput!, "owner");
      setInputValue(passwordInput!, "owner123");

      const loginForm = usernameInput!.closest("form");
      if (!loginForm) {
        throw new Error("Login form not found.");
      }
      loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flushUi();
    });

    await waitForCondition(() => container.textContent?.includes("Signed in as") ?? false);
    expect(container.textContent).toContain("Buy POS Plans or AI Credit Packages");
    expect(container.textContent).toContain("Purchases & AI Credit Invoices");
    expect(container.textContent).not.toContain("Device is not provisioned");
    expect(container.textContent).not.toContain("Activation Key Access");

    const loginRequest = vi
      .mocked(global.fetch)
      .mock.calls.find(([url]) => normalizeFetchUrl(String(url)) === "/api/account/login");
    expect(loginRequest).toBeTruthy();
    const loginBody = JSON.parse(String((loginRequest?.[1] as RequestInit).body));
    expect(loginBody.username).toBe("owner");
    expect(loginBody.password).toBe("owner123");
    expect("device_code" in loginBody).toBe(false);
  });

  it("creates purchase request as owner without device dependency", async () => {
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const requestUrl = normalizeFetchUrl(resolveRequestUrl(input));

      if (requestUrl === "/api/account/me") {
        return jsonResponse({
          user_id: "11111111-1111-1111-1111-111111111111",
          username: "owner",
          full_name: "Store Owner",
          role: "owner",
          session_id: "sess-02",
          shop_id: "33333333-3333-3333-3333-333333333333",
          shop_code: "default",
          expires_at: "2026-04-20T00:00:00Z",
          mfa_verified: true,
          auth_session_version: 1,
        });
      }

      if (requestUrl === "/api/account/products?take=120") {
        return jsonResponse({
          generated_at: "2026-04-13T00:00:00Z",
          count: 1,
          items: [
            {
              product_code: "ai_pack_100",
              product_name: "AI Credit Pack 100",
              product_type: "ai_credit",
              description: "",
              price: 5,
              currency: "USD",
              billing_mode: "one_time",
              validity: null,
              default_quantity_or_credits: 100,
              active: true,
            },
          ],
        });
      }

      if (requestUrl === "/api/account/purchases?take=80") {
        return jsonResponse({ generated_at: "2026-04-13T00:00:00Z", count: 0, items: [] });
      }

      if (requestUrl === "/api/account/ai/invoices?take=80") {
        return jsonResponse({ generated_at: "2026-04-13T00:00:00Z", count: 0, items: [] });
      }

      if (requestUrl === "/api/account/ai/wallet") {
        return jsonResponse({ available_credits: 0, updated_at: "2026-04-13T00:00:00Z" });
      }

      if (requestUrl === "/api/account/ai/ledger?take=30") {
        return jsonResponse({ items: [] });
      }

      if (requestUrl === "/api/account/ai/payments?take=30") {
        return jsonResponse({ items: [] });
      }

      if (requestUrl === "/api/account/purchases") {
        const requestInit = init as RequestInit;
        expect(requestInit.method).toBe("POST");
        return jsonResponse({
          purchase_id: "pur-02",
          order_number: "PO-002",
          shop_code: "default",
          status: "submitted",
          items: [
            {
              product_code: "ai_pack_100",
              product_name: "AI Credit Pack 100",
              product_type: "ai_credit",
              quantity: 2,
              amount: 10,
              currency: "USD",
              credits: 200,
            },
          ],
          total_amount: 10,
          currency: "USD",
          note: "April invoice",
          created_at: "2026-04-13T00:00:00Z",
        });
      }

      throw new Error(`Unexpected fetch URL: ${requestUrl}`);
    });

    await act(async () => {
      root.render(
        <I18nProvider locale="en" messages={{}}>
          <AccountPage />
        </I18nProvider>,
      );
      await flushUi();
    });

    await waitForCondition(() => container.textContent?.includes("Buy POS Plans or AI Credit Packages") ?? false);

    const quantityInput = container.querySelector('input[type="number"]') as HTMLInputElement | null;
    const noteInput = container.querySelector('input[placeholder="Invoice note for billing team"]') as HTMLInputElement | null;
    expect(quantityInput).toBeTruthy();
    expect(noteInput).toBeTruthy();

    await act(async () => {
      setInputValue(quantityInput!, "2");
      setInputValue(noteInput!, "April invoice");
      await flushUi();
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Create Purchase Request",
    ) as HTMLButtonElement | undefined;
    expect(submitButton).toBeTruthy();

    await act(async () => {
      submitButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushUi();
    });

    await waitForCondition(() =>
      vi
        .mocked(global.fetch)
        .mock.calls.some(([url]) => normalizeFetchUrl(String(url)) === "/api/account/purchases"),
    );

    const purchaseRequest = vi
      .mocked(global.fetch)
      .mock.calls.find(([url]) => normalizeFetchUrl(String(url)) === "/api/account/purchases");
    expect(purchaseRequest).toBeTruthy();
    const requestBody = JSON.parse(String((purchaseRequest?.[1] as RequestInit).body));
    expect(requestBody).toEqual({
      items: [
        {
          product_code: "ai_pack_100",
          quantity: 2,
        },
      ],
      note: "April invoice",
    });

    await waitForCondition(() =>
      container.textContent?.includes("Purchase request submitted. Billing admin approval is required.") ?? false,
    );
  });

  it("shows owner-only commerce restriction for cashier role", async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const requestUrl = normalizeFetchUrl(resolveRequestUrl(input));

      if (requestUrl === "/api/account/me") {
        return jsonResponse({
          user_id: "11111111-1111-1111-1111-111111111111",
          username: "cashier",
          full_name: "Cashier User",
          role: "cashier",
          session_id: "sess-03",
          shop_id: "33333333-3333-3333-3333-333333333333",
          shop_code: "default",
          expires_at: "2026-04-20T00:00:00Z",
          mfa_verified: true,
          auth_session_version: 1,
        });
      }

      if (requestUrl === "/api/account/products?take=120") {
        return jsonResponse({ generated_at: "2026-04-13T00:00:00Z", count: 0, items: [] });
      }

      if (requestUrl === "/api/account/purchases?take=80") {
        return jsonResponse({ generated_at: "2026-04-13T00:00:00Z", count: 0, items: [] });
      }

      if (requestUrl === "/api/account/ai/wallet") {
        return jsonResponse({ available_credits: 0, updated_at: "2026-04-13T00:00:00Z" });
      }

      if (requestUrl === "/api/account/ai/ledger?take=30") {
        return jsonResponse({ items: [] });
      }

      if (requestUrl === "/api/account/ai/payments?take=30") {
        return jsonResponse({ items: [] });
      }

      throw new Error(`Unexpected fetch URL: ${requestUrl}`);
    });

    await act(async () => {
      root.render(
        <I18nProvider locale="en" messages={{}}>
          <AccountPage />
        </I18nProvider>,
      );
      await flushUi();
    });

    await waitForCondition(() => container.textContent?.includes("Signed in as") ?? false);
    expect(container.textContent).toContain("Only shop owners can create package and AI credit purchases.");
    expect(container.textContent).not.toContain("Create Purchase Request");

    const invoiceCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) => normalizeFetchUrl(String(url)).startsWith("/api/account/ai/invoices?"));
    expect(invoiceCalls.length).toBe(0);
  });
});
