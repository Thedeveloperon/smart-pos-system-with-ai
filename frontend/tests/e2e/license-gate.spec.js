import { expect, test } from "@playwright/test";

const API_ORIGIN = "http://127.0.0.1:5080";
const DEVICE_CODE = "playwright-license-gate-device";

function licenseStatus(state, overrides = {}) {
  return {
    state,
    shop_id: "00000000-0000-0000-0000-000000000001",
    device_code: DEVICE_CODE,
    subscription_status: "active",
    plan: "starter",
    seat_limit: 2,
    active_seats: 1,
    valid_until: "2027-01-01T00:00:00.000Z",
    grace_until: "2027-01-08T00:00:00.000Z",
    license_token: "playwright-license-token",
    blocked_actions: [],
    server_time: "2026-03-31T12:00:00.000Z",
    ...overrides,
  };
}

async function seedDeviceCode(page) {
  await page.addInitScript((value) => {
    window.localStorage.setItem("smartpos-device-code", value);
    window.localStorage.removeItem("smartpos-license-token");
  }, DEVICE_CODE);
}

test("shows activation screen for unprovisioned device", async ({ page }) => {
  await seedDeviceCode(page);
  await page.route(`${API_ORIGIN}/api/license/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        licenseStatus("unprovisioned", {
          shop_id: null,
          subscription_status: null,
          plan: null,
          seat_limit: null,
          active_seats: null,
          valid_until: null,
          grace_until: null,
          license_token: null,
        })
      ),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "License Activation Required" })).toBeVisible();
  await expect(page.getByText("playwright-license-gate-device")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate Device" })).toBeVisible();
});

test("activation transitions to sign-in flow", async ({ page }) => {
  await seedDeviceCode(page);
  await page.route(`${API_ORIGIN}/api/license/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        licenseStatus("unprovisioned", {
          shop_id: null,
          subscription_status: null,
          plan: null,
          seat_limit: null,
          active_seats: null,
          valid_until: null,
          grace_until: null,
          license_token: null,
        })
      ),
    });
  });

  await page.route(`${API_ORIGIN}/api/provision/activate`, async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload.device_code).toBe(DEVICE_CODE);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(licenseStatus("active")),
    });
  });

  await page.route(`${API_ORIGIN}/api/auth/me`, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unauthorized" }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activate Device" }).click();

  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "License Activation Required" })).toHaveCount(0);
});

test("shows blocked screen and recovery guidance for suspended license", async ({ page }) => {
  await seedDeviceCode(page);
  await page.route(`${API_ORIGIN}/api/license/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        licenseStatus("suspended", {
          subscription_status: "past_due",
          blocked_actions: ["checkout", "refund"],
        })
      ),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "License Suspended" })).toBeVisible();
  await expect(page.getByText("Recovery steps")).toBeVisible();
  await expect(page.getByText("checkout, refund")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recheck Status" })).toBeVisible();
});

test("shows blocked screen for revoked license", async ({ page }) => {
  await seedDeviceCode(page);
  await page.route(`${API_ORIGIN}/api/license/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        licenseStatus("revoked", {
          subscription_status: "canceled",
          blocked_actions: ["all"],
        })
      ),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "License Revoked" })).toBeVisible();
  await expect(page.getByText("cannot continue checkout operations")).toBeVisible();
});

test("shows grace banner when authenticated in grace mode", async ({ page }) => {
  await seedDeviceCode(page);
  await page.route(`${API_ORIGIN}/api/license/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        licenseStatus("grace", {
          subscription_status: "past_due",
          valid_until: "2026-03-30T10:00:00.000Z",
          grace_until: "2026-04-06T10:00:00.000Z",
        })
      ),
    });
  });

  await page.route(`${API_ORIGIN}/api/auth/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user_id: "u-manager",
        username: "manager",
        full_name: "Test Manager",
        role: "manager",
        device_id: "d-1",
        device_code: DEVICE_CODE,
        expires_at: "2026-04-01T12:00:00.000Z",
      }),
    });
  });

  await page.route(`${API_ORIGIN}/api/products/search*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route(`${API_ORIGIN}/api/checkout/held`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route(`${API_ORIGIN}/api/cash-sessions/current`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });

  await page.goto("/");

  await expect(page.getByText("License grace mode")).toBeVisible();
  await expect(page.getByText(/Grace until/i)).toBeVisible();
});
