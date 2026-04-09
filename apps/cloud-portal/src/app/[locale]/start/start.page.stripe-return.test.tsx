import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import I18nProvider from "@/i18n/I18nProvider";
import StartPage from "@/app/[locale]/start/page";

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

describe("Start page Stripe return flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    window.history.replaceState({}, "", "/en/start?plan=pro&checkout=success&session_id=cs_test_return_001");

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

  it("shows account handoff link when Stripe checkout status reports access_ready", async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const requestUrl = normalizeFetchUrl(typeof input === "string" ? input : input.url);
      if (requestUrl === "/api/payment/stripe-checkout-status?session_id=cs_test_return_001") {
        return jsonResponse({
          generated_at: "2026-04-07T10:00:00Z",
          checkout_session_id: "cs_test_return_001",
          checkout_status: "complete",
          checkout_payment_status: "paid",
          shop_code: "default",
          shop_name: "Integration Test Shop",
          invoice: {
            invoice_id: "11111111-1111-1111-1111-111111111111",
            invoice_number: "INV-RET-001",
            status: "paid",
            due_at: "2026-04-08T00:00:00Z",
          },
          payment_status: "verified",
          subscription_id: "sub_test_001",
          subscription_status: "active",
          plan: "growth",
          access_ready: true,
          stripe_event_hint: "license_access_ready",
        });
      }

      throw new Error(`Unexpected fetch URL: ${requestUrl}`);
    });

    await act(async () => {
      root.render(
        <I18nProvider locale="en" messages={{}}>
          <StartPage />
        </I18nProvider>,
      );
      await flushUi();
    });

    await waitForCondition(() =>
      container.textContent?.includes("Stripe checkout completed. Confirming payment status...") ?? false,
    );

    await waitForCondition(() =>
      container.textContent?.includes("Payment confirmed and access is ready.") ?? false,
    );

    const accountLink = Array.from(container.querySelectorAll("a")).find(
      (anchor) => anchor.textContent?.trim() === "Open My Account",
    ) as HTMLAnchorElement | undefined;

    expect(accountLink).toBeTruthy();
    expect(accountLink?.getAttribute("href")).toBe("/en/account");

    expect(window.location.search.includes("checkout=")).toBe(false);
    expect(window.location.search.includes("session_id=")).toBe(false);

    const checkoutStatusCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) =>
        normalizeFetchUrl(String(url)).startsWith("/api/payment/stripe-checkout-status?session_id="),
      );
    expect(checkoutStatusCalls.length).toBeGreaterThan(0);
  });
});
