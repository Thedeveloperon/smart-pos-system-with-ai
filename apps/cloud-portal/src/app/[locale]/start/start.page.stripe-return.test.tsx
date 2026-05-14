import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import I18nProvider from "@/i18n/I18nProvider";
import StartPage from "@/app/[locale]/start/page";

async function flushUi() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Start page manual onboarding mode", () => {
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

  it("keeps paid onboarding in manual mode and does not poll Stripe checkout status", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en" messages={{}}>
          <StartPage />
        </I18nProvider>,
      );
      await flushUi();
    });

    expect(container.textContent).toContain("This rollout supports bank transfer/cash manual onboarding for paid plans.");
    const stripeStatusCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) =>
        String(url).includes("/api/payment/stripe-checkout-status"),
      );
    expect(stripeStatusCalls).toHaveLength(0);
  });
});
