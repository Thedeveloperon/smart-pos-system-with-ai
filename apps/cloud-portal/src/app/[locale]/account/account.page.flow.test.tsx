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

function getHeaderValue(headers: HeadersInit | undefined, key: string) {
  if (!headers) {
    return null;
  }

  const normalizedKey = key.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(key);
  }

  if (Array.isArray(headers)) {
    const row = headers.find(([headerKey]) => headerKey.toLowerCase() === normalizedKey);
    return row?.[1] ?? null;
  }

  const mapped = headers as Record<string, string>;
  const direct = mapped[key];
  if (typeof direct === "string") {
    return direct;
  }

  const matchedKey = Object.keys(mapped).find((candidate) => candidate.toLowerCase() === normalizedKey);
  return matchedKey ? mapped[matchedKey] : null;
}

function normalizeFetchUrl(url: string) {
  const parsed = url.startsWith("http")
    ? new URL(url)
    : new URL(url, "http://localhost");
  return `${parsed.pathname}${parsed.search}`;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  );
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
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

describe("Account page authenticated flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
    window.localStorage.setItem("smartpos_marketing_account_device_code_v1", "MKTWEB-TESTDEV");
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

  it("signs in, loads portal, and deactivates a device with refreshed state", async () => {
    let portalCallCount = 0;
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const rawRequestUrl = typeof input === "string" ? input : input.url;
      const parsedRequestUrl = rawRequestUrl.startsWith("http")
        ? new URL(rawRequestUrl)
        : new URL(rawRequestUrl, "http://localhost");
      const requestUrl = `${parsedRequestUrl.pathname}${parsedRequestUrl.search}`;

      if (requestUrl === "/api/account/me") {
        return jsonResponse({ message: "Unauthorized" }, { status: 401 });
      }

      if (requestUrl === "/api/account/login") {
        return jsonResponse({
          user_id: "11111111-1111-1111-1111-111111111111",
          username: "manager",
          full_name: "Manager",
          role: "manager",
          device_id: "22222222-2222-2222-2222-222222222222",
          device_code: "MKTWEB-TESTDEV",
          expires_at: "2026-04-08T00:00:00Z",
          mfa_verified: true,
        });
      }

      if (requestUrl === "/api/account/license-portal") {
        portalCallCount += 1;
        if (portalCallCount === 1) {
          return jsonResponse({
            generated_at: "2026-04-07T10:00:00Z",
            shop_id: "33333333-3333-3333-3333-333333333333",
            shop_code: "default",
            shop_name: "Integration Test Shop",
            subscription_status: "active",
            plan: "growth",
            seat_limit: 5,
            active_seats: 2,
            self_service_deactivation_limit_per_day: 2,
            self_service_deactivations_used_today: 0,
            self_service_deactivations_remaining_today: 2,
            can_deactivate_more_devices_today: true,
            latest_activation_entitlement: {
              activation_entitlement_key: "SPK-TEST-KEY-123456",
              max_activations: 3,
              activations_used: 1,
              expires_at: "2026-05-07T00:00:00Z",
            },
            devices: [
              {
                provisioned_device_id: "44444444-4444-4444-4444-444444444444",
                device_code: "DEV-A",
                device_name: "Counter POS",
                device_status: "active",
                license_state: "active",
                assigned_at: "2026-04-01T00:00:00Z",
                last_heartbeat_at: "2026-04-07T09:59:00Z",
                valid_until: "2026-05-01T00:00:00Z",
                grace_until: null,
                is_current_device: false,
              },
            ],
          });
        }

        return jsonResponse({
          generated_at: "2026-04-07T10:01:00Z",
          shop_id: "33333333-3333-3333-3333-333333333333",
          shop_code: "default",
          shop_name: "Integration Test Shop",
          subscription_status: "active",
          plan: "growth",
          seat_limit: 5,
          active_seats: 1,
          self_service_deactivation_limit_per_day: 2,
          self_service_deactivations_used_today: 1,
          self_service_deactivations_remaining_today: 1,
          can_deactivate_more_devices_today: true,
          latest_activation_entitlement: {
            activation_entitlement_key: "SPK-TEST-KEY-123456",
            max_activations: 3,
            activations_used: 1,
            expires_at: "2026-05-07T00:00:00Z",
          },
          devices: [
            {
              provisioned_device_id: "44444444-4444-4444-4444-444444444444",
              device_code: "DEV-A",
              device_name: "Counter POS",
              device_status: "revoked",
              license_state: "revoked",
              assigned_at: "2026-04-01T00:00:00Z",
              last_heartbeat_at: "2026-04-07T09:59:00Z",
              valid_until: "2026-05-01T00:00:00Z",
              grace_until: null,
              is_current_device: false,
            },
          ],
        });
      }

      if (requestUrl === "/api/account/ai/wallet") {
        return jsonResponse({
          available_credits: 520,
          updated_at: "2026-04-07T10:00:00Z",
        });
      }

      if (requestUrl === "/api/account/ai/credit-packs") {
        return jsonResponse({
          items: [
            {
              pack_code: "pack_100",
              credits: 100,
              price: 5,
              currency: "USD",
            },
            {
              pack_code: "pack_500",
              credits: 500,
              price: 20,
              currency: "USD",
            },
          ],
        });
      }

      if (requestUrl.startsWith("/api/account/ai/ledger?take=")) {
        return jsonResponse({
          items: [],
        });
      }

      if (requestUrl.startsWith("/api/account/ai/payments?take=")) {
        return jsonResponse({
          items: [
            {
              payment_id: "55555555-5555-5555-5555-555555555555",
              payment_status: "succeeded",
              payment_method: "card",
              provider: "stripe",
              credits: 500,
              amount: 20,
              currency: "USD",
              external_reference: "ai_checkout_ref_001",
              created_at: "2026-04-07T09:00:00Z",
              completed_at: "2026-04-07T09:01:00Z",
            },
          ],
        });
      }

      if (requestUrl.startsWith("/api/license/access-success?activation_entitlement_key=")) {
        return jsonResponse({
          generated_at: "2026-04-07T10:00:00Z",
          shop_id: "33333333-3333-3333-3333-333333333333",
          shop_code: "default",
          shop_name: "Integration Test Shop",
          subscription_status: "active",
          plan: "growth",
          seat_limit: 5,
          entitlement_state: "active",
          can_activate: true,
          installer_download_url: "https://downloads.smartpos.test/installer.exe",
          installer_download_expires_at: "2026-04-08T00:00:00Z",
          installer_download_protected: true,
          installer_checksum_sha256: "abc123",
          activation_entitlement: {
            activation_entitlement_key: "SPK-TEST-KEY-123456",
            max_activations: 3,
            activations_used: 1,
            expires_at: "2026-05-07T00:00:00Z",
            status: "active",
          },
        });
      }

      if (requestUrl === "/api/account/license-portal/devices/DEV-A/deactivate") {
        return jsonResponse({
          status: "revoked",
        });
      }

      throw new Error(`Unexpected fetch URL: ${rawRequestUrl}`);
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

    const usernameInput = container.querySelector('input[placeholder="owner"]') as HTMLInputElement | null;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement | null;
    const deviceCodeInput = Array.from(container.querySelectorAll("input")).find(
      (element) => element.getAttribute("placeholder") === null && element.value.includes("MKTWEB-"),
    ) as HTMLInputElement | undefined;

    expect(usernameInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    expect(deviceCodeInput).toBeTruthy();
    expect(deviceCodeInput?.value).toBe("MKTWEB-TESTDEV");

    await act(async () => {
      setInputValue(usernameInput!, "manager");
      setInputValue(passwordInput!, "manager123");
      setInputValue(deviceCodeInput!, "MKTWEB-TESTDEV");

      const loginForm = usernameInput!.closest("form");
      if (!loginForm) {
        throw new Error("Login form not found.");
      }
      loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flushUi();
    });

    await waitForCondition(() =>
      vi
        .mocked(global.fetch)
        .mock.calls.some(([url]) => normalizeFetchUrl(String(url)) === "/api/account/login"),
    );

    await waitForCondition(() => container.textContent?.includes("Licensed Account") ?? false);
    expect(container.textContent).toContain("Counter POS");

    const deactivateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Deactivate Device",
    );
    expect(deactivateButton).toBeTruthy();

    await act(async () => {
      deactivateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushUi();
    });

    await waitForCondition(() => container.textContent?.includes("Status: revoked") ?? false);
    expect(container.textContent).toContain("Signed in as");
    expect(portalCallCount).toBe(2);

    const deactivateRequest = vi
      .mocked(global.fetch)
      .mock.calls.find(([url]) => normalizeFetchUrl(String(url)) === "/api/account/license-portal/devices/DEV-A/deactivate");
    expect(deactivateRequest).toBeTruthy();
    const init = deactivateRequest?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ reason: "customer_self_service" }));
    expect(getHeaderValue(init.headers, "content-type")).toBe("application/json");
    expect(getHeaderValue(init.headers, "Idempotency-Key")).toBeTruthy();
  });

  it("creates AI checkout and reconciles checkout status to succeeded", async () => {
    let paymentHistoryCallCount = 0;
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const rawRequestUrl = typeof input === "string" ? input : input.url;
      const requestUrl = normalizeFetchUrl(rawRequestUrl);

      if (requestUrl === "/api/account/me") {
        return jsonResponse({
          user_id: "11111111-1111-1111-1111-111111111111",
          username: "manager",
          full_name: "Manager",
          role: "manager",
          device_id: "22222222-2222-2222-2222-222222222222",
          device_code: "MKTWEB-TESTDEV",
          expires_at: "2026-04-08T00:00:00Z",
          mfa_verified: true,
        });
      }

      if (requestUrl === "/api/account/license-portal") {
        return jsonResponse({
          generated_at: "2026-04-07T10:00:00Z",
          shop_id: "33333333-3333-3333-3333-333333333333",
          shop_code: "default",
          shop_name: "Integration Test Shop",
          subscription_status: "active",
          plan: "growth",
          seat_limit: 5,
          active_seats: 2,
          self_service_deactivation_limit_per_day: 2,
          self_service_deactivations_used_today: 0,
          self_service_deactivations_remaining_today: 2,
          can_deactivate_more_devices_today: true,
          latest_activation_entitlement: {
            activation_entitlement_key: "SPK-TEST-KEY-123456",
            max_activations: 3,
            activations_used: 1,
            expires_at: "2026-05-07T00:00:00Z",
          },
          devices: [],
        });
      }

      if (requestUrl === "/api/account/ai/wallet") {
        return jsonResponse({
          available_credits: 620,
          updated_at: "2026-04-07T10:00:00Z",
        });
      }

      if (requestUrl === "/api/account/ai/credit-packs") {
        return jsonResponse({
          items: [
            {
              pack_code: "pack_500",
              credits: 500,
              price: 20,
              currency: "USD",
            },
          ],
        });
      }

      if (requestUrl.startsWith("/api/account/ai/ledger?take=")) {
        return jsonResponse({
          items: [],
        });
      }

      if (requestUrl.startsWith("/api/account/ai/payments?take=")) {
        paymentHistoryCallCount += 1;
        if (paymentHistoryCallCount === 1) {
          return jsonResponse({ items: [] });
        }

        if (paymentHistoryCallCount === 2) {
          return jsonResponse({
            items: [
              {
                payment_id: "55555555-5555-5555-5555-555555555555",
                payment_status: "pending",
                payment_method: "card",
                provider: "stripe",
                credits: 500,
                amount: 20,
                currency: "USD",
                external_reference: "ai_checkout_ref_001",
                created_at: "2026-04-07T10:01:00Z",
                completed_at: null,
              },
            ],
          });
        }

        return jsonResponse({
          items: [
            {
              payment_id: "55555555-5555-5555-5555-555555555555",
              payment_status: "succeeded",
              payment_method: "card",
              provider: "stripe",
              credits: 500,
              amount: 20,
              currency: "USD",
              external_reference: "ai_checkout_ref_001",
              created_at: "2026-04-07T10:01:00Z",
              completed_at: "2026-04-07T10:02:00Z",
            },
          ],
        });
      }

      if (requestUrl === "/api/account/ai/payments/checkout") {
        return jsonResponse({
          payment_id: "55555555-5555-5555-5555-555555555555",
          payment_status: "pending",
          payment_method: "card",
          provider: "stripe",
          pack_code: "pack_500",
          credits: 500,
          amount: 20,
          currency: "USD",
          external_reference: "ai_checkout_ref_001",
          checkout_url: null,
          created_at: "2026-04-07T10:01:00Z",
        });
      }

      if (requestUrl.startsWith("/api/license/access-success?activation_entitlement_key=")) {
        return jsonResponse({
          generated_at: "2026-04-07T10:00:00Z",
          shop_id: "33333333-3333-3333-3333-333333333333",
          shop_code: "default",
          shop_name: "Integration Test Shop",
          subscription_status: "active",
          plan: "growth",
          seat_limit: 5,
          entitlement_state: "active",
          can_activate: true,
          installer_download_url: "https://downloads.smartpos.test/installer.exe",
          installer_download_expires_at: "2026-04-08T00:00:00Z",
          installer_download_protected: true,
          installer_checksum_sha256: "abc123",
          activation_entitlement: {
            activation_entitlement_key: "SPK-TEST-KEY-123456",
            max_activations: 3,
            activations_used: 1,
            expires_at: "2026-05-07T00:00:00Z",
            status: "active",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${rawRequestUrl}`);
    });

    await act(async () => {
      root.render(
        <I18nProvider locale="en" messages={{}}>
          <AccountPage />
        </I18nProvider>,
      );
      await flushUi();
    });

    await waitForCondition(() => container.textContent?.includes("Licensed Account") ?? false);

    const topUpPackSelect = container.querySelector("select") as HTMLSelectElement | null;
    expect(topUpPackSelect).toBeTruthy();

    await act(async () => {
      setSelectValue(topUpPackSelect!, "pack_500");
      await flushUi();
    });

    const payWithCardButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Pay with Card"),
    );
    expect(payWithCardButton).toBeTruthy();

    await act(async () => {
      payWithCardButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushUi();
    });

    await waitForCondition(() =>
      vi
        .mocked(global.fetch)
        .mock.calls.some(([url]) => normalizeFetchUrl(String(url)) === "/api/account/ai/payments/checkout"),
    );

    const checkoutRequest = vi
      .mocked(global.fetch)
      .mock.calls.find(([url]) => normalizeFetchUrl(String(url)) === "/api/account/ai/payments/checkout");
    expect(checkoutRequest).toBeTruthy();

    const checkoutInit = checkoutRequest?.[1] as RequestInit;
    expect(checkoutInit.method).toBe("POST");
    expect(checkoutInit.body).toBe(
      JSON.stringify({
        pack_code: "pack_500",
        payment_method: "card",
      }),
    );
    expect(getHeaderValue(checkoutInit.headers, "content-type")).toBe("application/json");
    expect(getHeaderValue(checkoutInit.headers, "Idempotency-Key")).toBeTruthy();

    await waitForCondition(() => container.textContent?.includes("Latest Checkout Status") ?? false);
    await waitForCondition(() => container.textContent?.includes("Status: succeeded") ?? false);
    expect(container.textContent).toContain("AI credit top-up confirmed. Wallet balance has been updated.");
    expect(paymentHistoryCallCount).toBeGreaterThanOrEqual(3);
  });

  it("submits manual bank transfer checkout from account fallback section", async () => {
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const rawRequestUrl = typeof input === "string" ? input : input.url;
      const requestUrl = normalizeFetchUrl(rawRequestUrl);

      if (requestUrl === "/api/account/me") {
        return jsonResponse({
          user_id: "11111111-1111-1111-1111-111111111111",
          username: "manager",
          full_name: "Manager",
          role: "manager",
          device_id: "22222222-2222-2222-2222-222222222222",
          device_code: "MKTWEB-TESTDEV",
          expires_at: "2026-04-08T00:00:00Z",
          mfa_verified: true,
        });
      }

      if (requestUrl === "/api/account/license-portal") {
        return jsonResponse({
          generated_at: "2026-04-07T10:00:00Z",
          shop_id: "33333333-3333-3333-3333-333333333333",
          shop_code: "default",
          shop_name: "Integration Test Shop",
          subscription_status: "active",
          plan: "growth",
          seat_limit: 5,
          active_seats: 2,
          self_service_deactivation_limit_per_day: 2,
          self_service_deactivations_used_today: 0,
          self_service_deactivations_remaining_today: 2,
          can_deactivate_more_devices_today: true,
          latest_activation_entitlement: {
            activation_entitlement_key: "SPK-TEST-KEY-123456",
            max_activations: 3,
            activations_used: 1,
            expires_at: "2026-05-07T00:00:00Z",
          },
          devices: [],
        });
      }

      if (requestUrl === "/api/account/ai/wallet") {
        return jsonResponse({
          available_credits: 120,
          updated_at: "2026-04-07T10:00:00Z",
        });
      }

      if (requestUrl === "/api/account/ai/credit-packs") {
        return jsonResponse({
          items: [
            {
              pack_code: "pack_100",
              credits: 100,
              price: 5,
              currency: "USD",
            },
          ],
        });
      }

      if (requestUrl.startsWith("/api/account/ai/ledger?take=")) {
        return jsonResponse({
          items: [],
        });
      }

      if (requestUrl.startsWith("/api/account/ai/payments?take=")) {
        return jsonResponse({
          items: [
            {
              payment_id: "55555555-5555-5555-5555-555555555555",
              payment_status: "pending_verification",
              payment_method: "bank_deposit",
              provider: "manual",
              credits: 100,
              amount: 5,
              currency: "USD",
              external_reference: "ai_checkout_manual_ref_001",
              created_at: "2026-04-07T10:01:00Z",
              completed_at: null,
            },
          ],
        });
      }

      if (requestUrl === "/api/account/ai/payments/checkout") {
        return jsonResponse({
          payment_id: "55555555-5555-5555-5555-555555555555",
          payment_status: "pending_verification",
          payment_method: "bank_deposit",
          provider: "manual",
          pack_code: "pack_100",
          credits: 100,
          amount: 5,
          currency: "USD",
          external_reference: "ai_checkout_manual_ref_001",
          checkout_url: null,
          created_at: "2026-04-07T10:01:00Z",
        });
      }

      if (requestUrl.startsWith("/api/license/access-success?activation_entitlement_key=")) {
        return jsonResponse({
          generated_at: "2026-04-07T10:00:00Z",
          shop_id: "33333333-3333-3333-3333-333333333333",
          shop_code: "default",
          shop_name: "Integration Test Shop",
          subscription_status: "active",
          plan: "growth",
          seat_limit: 5,
          entitlement_state: "active",
          can_activate: true,
          installer_download_url: "https://downloads.smartpos.test/installer.exe",
          installer_download_expires_at: "2026-04-08T00:00:00Z",
          installer_download_protected: true,
          installer_checksum_sha256: "abc123",
          activation_entitlement: {
            activation_entitlement_key: "SPK-TEST-KEY-123456",
            max_activations: 3,
            activations_used: 1,
            expires_at: "2026-05-07T00:00:00Z",
            status: "active",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${rawRequestUrl}`);
    });

    await act(async () => {
      root.render(
        <I18nProvider locale="en" messages={{}}>
          <AccountPage />
        </I18nProvider>,
      );
      await flushUi();
    });

    await waitForCondition(() => container.textContent?.includes("Licensed Account") ?? false);

    const manualToggleButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Need Bank Transfer?"),
    );
    expect(manualToggleButton).toBeTruthy();

    await act(async () => {
      manualToggleButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushUi();
    });

    const referenceInput = container.querySelector(
      'input[placeholder="BANK-REF-001"]',
    ) as HTMLInputElement | null;
    expect(referenceInput).toBeTruthy();

    await act(async () => {
      setInputValue(referenceInput!, "BD-TEST-1001");
      await flushUi();
    });

    const submitManualPaymentButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Submit Manual Payment"),
    );
    expect(submitManualPaymentButton).toBeTruthy();

    await act(async () => {
      submitManualPaymentButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushUi();
    });

    await waitForCondition(() =>
      vi
        .mocked(global.fetch)
        .mock.calls.some(([url]) => normalizeFetchUrl(String(url)) === "/api/account/ai/payments/checkout"),
    );

    const checkoutRequest = vi
      .mocked(global.fetch)
      .mock.calls.find(([url]) => normalizeFetchUrl(String(url)) === "/api/account/ai/payments/checkout");
    expect(checkoutRequest).toBeTruthy();

    const checkoutInit = checkoutRequest?.[1] as RequestInit;
    expect(checkoutInit.method).toBe("POST");
    expect(checkoutInit.body).toBe(
      JSON.stringify({
        pack_code: "pack_100",
        payment_method: "bank_deposit",
        bank_reference: "BD-TEST-1001",
      }),
    );
    expect(getHeaderValue(checkoutInit.headers, "content-type")).toBe("application/json");
    expect(getHeaderValue(checkoutInit.headers, "Idempotency-Key")).toBeTruthy();

    await waitForCondition(() =>
      container.textContent?.includes("Manual payment request submitted. Your credits will be added after billing verification.") ?? false,
    );
    expect(container.textContent).toContain("Status: pending verification");
  });

  it("shows role-based access denied message for cashier login without calling portal API", async () => {
    let portalCallCount = 0;
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const rawRequestUrl = typeof input === "string" ? input : input.url;
      const requestUrl = normalizeFetchUrl(rawRequestUrl);

      if (requestUrl === "/api/account/me") {
        return jsonResponse({ message: "Unauthorized" }, { status: 401 });
      }

      if (requestUrl === "/api/account/login") {
        return jsonResponse({
          user_id: "11111111-1111-1111-1111-111111111111",
          username: "cashier",
          full_name: "Cashier User",
          role: "cashier",
          device_id: "22222222-2222-2222-2222-222222222222",
          device_code: "MKTWEB-TESTDEV",
          expires_at: "2026-04-08T00:00:00Z",
          mfa_verified: true,
        });
      }

      if (requestUrl === "/api/account/license-portal") {
        portalCallCount += 1;
        return jsonResponse(
          {
            error: {
              code: "FORBIDDEN",
              message: "Requires manager or owner role.",
            },
          },
          { status: 403 },
        );
      }

      throw new Error(`Unexpected fetch URL: ${rawRequestUrl}`);
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

    const usernameInput = container.querySelector('input[placeholder="owner"]') as HTMLInputElement | null;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement | null;
    const deviceCodeInput = Array.from(container.querySelectorAll("input")).find(
      (element) => element.getAttribute("placeholder") === null && element.value.includes("MKTWEB-"),
    ) as HTMLInputElement | undefined;

    expect(usernameInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    expect(deviceCodeInput).toBeTruthy();

    await act(async () => {
      setInputValue(usernameInput!, "cashier");
      setInputValue(passwordInput!, "cashier123");
      setInputValue(deviceCodeInput!, "MKTWEB-TESTDEV");

      const loginForm = usernameInput!.closest("form");
      if (!loginForm) {
        throw new Error("Login form not found.");
      }

      loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flushUi();
    });

    await waitForCondition(() => container.textContent?.includes("Signed in as") ?? false);
    expect(container.textContent).toContain("Role: cashier");
    expect(container.textContent).toContain("cannot access license management");
    expect(container.textContent).not.toContain("Licensed Account");
    expect(portalCallCount).toBe(0);
  });
});
