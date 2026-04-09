import { expect, test } from "@playwright/test";

async function loginAsManager(page, { path = "/" } = {}) {
  const deviceCode = "playwright-manager-device";

  await page.route("http://127.0.0.1:5080/api/license/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: "active",
        shop_id: "00000000-0000-0000-0000-000000000001",
        device_code: deviceCode,
        subscription_status: "active",
        plan: "starter",
        seat_limit: 2,
        active_seats: 1,
        valid_until: "2027-01-01T00:00:00.000Z",
        grace_until: "2027-01-08T00:00:00.000Z",
        license_token: "checkout-spec-license-token",
        blocked_actions: [],
        server_time: "2026-03-31T12:00:00.000Z",
      }),
    });
  });

  const response = await page.request.post("http://127.0.0.1:5080/api/auth/login", {
    data: {
      username: "manager",
      password: "manager123",
      device_code: deviceCode,
      device_name: "Playwright",
    },
  });
  expect(response.ok()).toBeTruthy();

  await page.addInitScript((value) => {
    window.localStorage.setItem("smartpos-device-code", value);
    window.localStorage.removeItem("smartpos-license-token");
  }, deviceCode);

  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Sign In" })).toHaveCount(0);
}

test("manager session renders current POS shell", async ({ page }) => {
  await loginAsManager(page);

  const openingDialog = page.getByRole("heading", { name: "Opening Cash Count" });
  const shiftClosed = page.getByRole("heading", { name: "Shift Closed" });
  const productSearch = page.getByPlaceholder("Search products by name, SKU...").first();

  await expect
    .poll(async () => {
      const [openingVisible, closedVisible, searchVisible] = await Promise.all([
        openingDialog.isVisible(),
        shiftClosed.isVisible(),
        productSearch.isVisible(),
      ]);
      return openingVisible || closedVisible || searchVisible;
    })
    .toBeTruthy();
});

test("unknown authenticated route shows not-found page", async ({ page }) => {
  await loginAsManager(page, { path: "/admin" });
  await expect(page.getByText("Oops! Page not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to Home" })).toBeVisible();
});
