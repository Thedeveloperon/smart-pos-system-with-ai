import { expect, test } from "@playwright/test";

async function loginAsManager(page, { path = "/" } = {}) {
  const response = await page.request.post("http://127.0.0.1:5080/api/auth/login", {
    data: {
      username: "manager",
      password: "manager123",
      device_code: "playwright-manager-device",
      device_name: "Playwright",
    },
  });
  expect(response.ok()).toBeTruthy();

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
