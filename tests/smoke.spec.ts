import { test, expect } from '@playwright/test'
import { captureConsoleErrors } from './helpers/errors'

/**
 * Wait for the React app to mount. The app shows either:
 * - "Loading..." while auth initializes
 * - The navigation bar once ready
 */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
}

test.describe('Smoke tests', () => {
  test('app loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/mentions')
    await waitForApp(page)
    expect(errors).toEqual([])
  })

  test('landing page renders at / for signed-out visitors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await page.waitForSelector('[data-testid="landing-page"]', { timeout: 15000 })
    await expect(page).toHaveTitle(/Listenpost/)
    await expect(
      page.getByRole('heading', { name: /Every mention\. Scored\. Routed\. Live\./i }),
    ).toBeVisible()
    // The landing owns the viewport — no stacked app chrome.
    await expect(page.getByTestId('app-navigation')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Start monitoring/i }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('navigation is visible', async ({ page }) => {
    await page.goto('/mentions')
    await waitForApp(page)
    await expect(page.getByTestId('app-navigation')).toBeVisible()
  })

  test('sign-in button visible when logged out', async ({ page }) => {
    await page.goto('/mentions')
    await waitForApp(page)
    await expect(page.getByTestId('nav-sign-in-button')).toBeVisible()
    await expect(page.getByTestId('nav-user-name')).toHaveCount(0)
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await waitForApp(page)
    await expect(page.locator('text=404')).toBeVisible()
  })

  test('pricing page is public and lists plan quotas', async ({ page }) => {
    await page.goto('/pricing')
    await waitForApp(page)
    await expect(page.getByTestId('auth-overlay')).toHaveCount(0)
    await expect(page.getByTestId('quota-details')).toContainText('15,000')
    await expect(page.getByTestId('quota-details')).toContainText('50,000')
    await expect(page.getByTestId('quota-details')).toContainText('$0.003')
    await expect(page.getByTestId('quota-details')).toContainText('$0.0025')
  })

  test('keywords page is auth-gated when signed out', async ({ page }) => {
    await page.goto('/keywords')
    await waitForApp(page)
    await expect(page.getByTestId('auth-overlay')).toBeVisible()
    await expect(page.getByTestId('add-keyword')).toHaveCount(0)
  })
})
