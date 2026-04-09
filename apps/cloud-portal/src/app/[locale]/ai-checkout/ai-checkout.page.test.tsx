import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import I18nProvider from "@/i18n/I18nProvider";
import AiCheckoutPage from "@/app/[locale]/ai-checkout/page";

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

describe("AI checkout return page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());

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

  it("shows succeeded status when payment history contains the checkout reference", async () => {
    window.history.replaceState({}, "", "/en/ai-checkout?reference=ai_checkout_ref_001&pack=pack_500");

    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const requestUrl = normalizeFetchUrl(typeof input === "string" ? input : input.url);
      if (requestUrl === "/api/account/ai/payments?take=100") {
        return jsonResponse({
          items: [
            {
              payment_id: "11111111-1111-1111-1111-111111111111",
              payment_status: "succeeded",
              payment_method: "card",
              provider: "mockpay",
              credits: 500,
              amount: 20,
              currency: "USD",
              external_reference: "ai_checkout_ref_001",
              created_at: "2026-04-09T05:00:00Z",
              completed_at: "2026-04-09T05:01:00Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${requestUrl}`);
    });

    await act(async () => {
      root.render(
        <I18nProvider locale="en" messages={{}}>
          <AiCheckoutPage />
        </I18nProvider>,
      );
      await flushUi();
    });

    await waitForCondition(() =>
      container.textContent?.includes("Payment completed successfully and credits are available.") ?? false,
    );

    const accountLink = Array.from(container.querySelectorAll("a")).find(
      (anchor) => anchor.textContent?.trim() === "Back to My Account",
    ) as HTMLAnchorElement | undefined;

    expect(accountLink).toBeTruthy();
    expect(accountLink?.getAttribute("href")).toBe("/en/account");

    const paymentsCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) => normalizeFetchUrl(String(url)).startsWith("/api/account/ai/payments?take="));
    expect(paymentsCalls.length).toBeGreaterThan(0);
  });

  it("shows session guidance when account proxy returns unauthorized", async () => {
    window.history.replaceState({}, "", "/en/ai-checkout?reference=ai_checkout_ref_401&pack=pack_100");

    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const requestUrl = normalizeFetchUrl(typeof input === "string" ? input : input.url);
      if (requestUrl === "/api/account/ai/payments?take=100") {
        return jsonResponse(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "Unauthorized",
            },
          },
          { status: 401 },
        );
      }

      throw new Error(`Unexpected fetch URL: ${requestUrl}`);
    });

    await act(async () => {
      root.render(
        <I18nProvider locale="en" messages={{}}>
          <AiCheckoutPage />
        </I18nProvider>,
      );
      await flushUi();
    });

    await waitForCondition(() =>
      container.textContent?.includes("Sign in to your account to check this payment status.") ?? false,
    );
  });
});

