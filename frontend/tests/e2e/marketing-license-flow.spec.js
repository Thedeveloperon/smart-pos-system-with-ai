import { expect, test } from "@playwright/test";

const BACKEND_ORIGIN = "http://127.0.0.1:5080";

test("marketing pricing CTA opens onboarding with expected plan", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/en");
  await expect(page.getByRole("heading", { name: "Simple, Transparent Pricing" })).toBeVisible();

  await page.getByRole("link", { name: "Start Free Trial" }).click();
  await expect(page).toHaveURL(/\/en\/start\?plan=pro/i);
  await expect(page.getByRole("heading", { name: "Start SmartPOS" })).toBeVisible();
});

test("license success page shows protected installer metadata and tracks download click", async ({ page }) => {
  await page.route(`${BACKEND_ORIGIN}/api/license/access/success*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generated_at: "2026-04-02T10:00:00.000Z",
        shop_id: "00000000-0000-0000-0000-000000000001",
        shop_code: "mkt-test-shop",
        shop_name: "Marketing Test Shop",
        subscription_status: "active",
        plan: "growth",
        seat_limit: 5,
        entitlement_state: "active",
        can_activate: true,
        installer_download_url: "/api/license/public/installer-download?token=test-token",
        installer_download_expires_at: "2026-04-02T12:00:00.000Z",
        installer_download_protected: true,
        installer_checksum_sha256: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd",
        activation_entitlement: {
          entitlement_id: "00000000-0000-0000-0000-000000000010",
          shop_id: "00000000-0000-0000-0000-000000000001",
          shop_code: "mkt-test-shop",
          activation_entitlement_key: "SPK-TEST-KEY-1234",
          source: "manual_payment_verified",
          source_reference: "00000000-0000-0000-0000-000000000020",
          status: "active",
          max_activations: 1,
          activations_used: 0,
          issued_by: "billing_admin",
          issued_at: "2026-04-02T10:00:00.000Z",
          expires_at: "2026-07-01T10:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
        },
      }),
    });
  });

  await page.route(`${BACKEND_ORIGIN}/api/license/public/download-track`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tracked_at: "2026-04-02T10:05:00.000Z",
        shop_code: "mkt-test-shop",
        activation_entitlement_key: "SPK-TEST-KEY-1234",
        source: "license_access_success",
        channel: "installer_download_button",
      }),
    });
  });

  await page.goto("/license/success?activation_entitlement_key=SPK-TEST-KEY-1234");

  await expect(page.getByRole("heading", { name: "Your SmartPOS Access Is Ready" })).toBeVisible();
  await expect(page.getByText("Download link expires:", { exact: false })).toBeVisible();
  await expect(page.getByText("SHA-256:", { exact: false })).toBeVisible();

  const downloadLink = page.getByRole("link", { name: "Download Installer" });
  await expect(downloadLink).toHaveAttribute(
    "href",
    "http://127.0.0.1:5080/api/license/public/installer-download?token=test-token",
  );

  const trackRequest = page.waitForRequest((request) => {
    return request.url() === `${BACKEND_ORIGIN}/api/license/public/download-track` && request.method() === "POST";
  });

  await downloadLink.click();
  await trackRequest;
});
