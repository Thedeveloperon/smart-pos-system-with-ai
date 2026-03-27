import { expect, test } from '@playwright/test'

async function loginAsManager(page) {
  const response = await page.request.post('http://127.0.0.1:5080/api/auth/login', {
    data: {
      username: 'manager',
      password: 'manager123',
      device_code: 'playwright-manager-device',
      device_name: 'Playwright',
    },
  })
  expect(response.ok()).toBeTruthy()

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'One-Screen Checkout' })).toBeVisible()
}

test('cash checkout completes and appears in recent sales', async ({ page }) => {
  await loginAsManager(page)

  const productSearchSection = page.locator('section').filter({
    hasText: 'Product Search',
  })
  await productSearchSection
    .getByPlaceholder('Search by name, SKU, or barcode')
    .fill('Ball Pen')
  await productSearchSection.getByRole('button', { name: 'Search' }).click()

  await expect(productSearchSection.getByRole('button', { name: 'Add' }).first()).toBeVisible()
  await productSearchSection.getByRole('button', { name: 'Add' }).first().click()

  await page.getByPlaceholder('Amount').first().fill('5000')
  await page.getByRole('button', { name: 'Complete Sale' }).click()

  await expect(page.getByText(/Sale completed \(/)).toBeVisible()

  const recentSalesSection = page.locator('section').filter({
    hasText: 'Recent Sales',
  })
  await expect(recentSalesSection.getByRole('button', { name: 'Reprint' }).first()).toBeVisible()
  await expect(recentSalesSection.getByRole('button', { name: 'WhatsApp' }).first()).toBeVisible()
})

test('launch readiness sync diagnostics can queue and sync test events', async ({ page }) => {
  await loginAsManager(page)

  await expect(page.getByTestId('offline-sync-panel')).toBeVisible()
  await expect(page.getByTestId('network-status-badge')).toHaveText(/Online|Offline/)

  const pendingCount = page.getByTestId('sync-count-pending')
  await expect(pendingCount).toHaveText(/\d+/)

  const pendingBefore = Number((await pendingCount.textContent()) ?? '0')

  await page.getByRole('button', { name: 'Queue Test Offline Event' }).click()
  await expect(page.getByText(/Offline test event queued/)).toBeVisible()

  await expect
    .poll(async () => Number((await pendingCount.textContent()) ?? '0'))
    .toBeGreaterThanOrEqual(pendingBefore + 1)

  await page.getByRole('button', { name: 'Sync Now' }).click()
  await expect(page.getByText(/Sync (finished|checked)/)).toBeVisible()

  await expect
    .poll(async () => Number((await pendingCount.textContent()) ?? '0'))
    .toBeLessThanOrEqual(pendingBefore)
})

test('onboarding panel can be dismissed and shown again', async ({ page }) => {
  await loginAsManager(page)

  const onboardingPanel = page.getByTestId('onboarding-panel')
  await expect(onboardingPanel).toBeVisible()

  await onboardingPanel.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByTestId('onboarding-panel')).toHaveCount(0)

  await page.getByRole('button', { name: 'Show Onboarding' }).click()
  await expect(page.getByTestId('onboarding-panel')).toBeVisible()
})

test('product and inventory management flow can create category, create product, and adjust stock', async ({ page }, testInfo) => {
  await loginAsManager(page)

  const unique = `${testInfo.project.name}-${Date.now()}`
  const categoryName = `E2E Category ${unique}`
  const productName = `E2E Product ${unique}`
  const sku = `E2E-${Date.now()}`
  const barcode = `99${Date.now()}`

  const panel = page.getByTestId('product-inventory-panel')
  await expect(panel).toBeVisible()

  const categoriesCard = panel.locator('article').filter({ hasText: 'Categories' }).first()
  await categoriesCard.getByLabel('Name').fill(categoryName)
  await categoriesCard.getByLabel('Description').fill('E2E category description')
  await categoriesCard.getByRole('button', { name: 'Create' }).click()
  await expect(categoriesCard.getByText(categoryName)).toBeVisible()

  const catalogCard = panel
    .locator('article')
    .filter({ hasText: 'Catalog & Stock Controls' })
    .first()
  await catalogCard.getByLabel('Product Name').fill(productName)
  await catalogCard.getByLabel('Category').selectOption({ label: categoryName })
  await catalogCard.getByLabel('SKU').fill(sku)
  await catalogCard.getByLabel('Barcode').fill(barcode)
  await catalogCard.getByLabel('Unit Price').fill('125')
  await catalogCard.getByLabel('Cost Price').fill('80')
  await catalogCard.getByLabel('Initial Stock').fill('10')
  await catalogCard.getByLabel('Reorder Level').fill('6')
  await catalogCard.getByRole('button', { name: 'Create Product' }).click()

  await catalogCard
    .getByPlaceholder('Search product catalog by name, SKU, barcode')
    .fill(barcode)
  await catalogCard.getByRole('button', { name: 'Search' }).click()
  await expect(catalogCard.getByText(productName)).toBeVisible()
  await catalogCard.getByRole('button', { name: 'Edit' }).first().click()

  await catalogCard.getByLabel('Delta Quantity').fill('-1')
  await catalogCard.getByLabel('Reason').fill('e2e_adjustment')
  await catalogCard.getByRole('button', { name: 'Apply Adjustment' }).click()
  await expect(page.getByText(/Stock adjusted/)).toBeVisible()
})
