import { test, expect } from 'deepspace/testing'
import { ensureWorkspace } from './helpers/workspace'

/**
 * Per-plan active-keyword cap (free tier: 2). The cap is what makes the
 * cost+margin pricing structural — paid-source polling scales per keyword.
 * This spec drives the UI gate; the authoritative cron/job gates share the
 * same keywordsWithinCap() helper (unit-tested in tests/unit/quota.test.ts).
 *
 * Keyword terms are nonsense strings so the immediate first crawl finds
 * nothing — no mentions inserted, no scoring jobs billed.
 */

const CAP = 2 // PLAN_KEYWORD_CAPS.free

test.describe('Keyword cap', () => {
  test('free tier blocks a third active keyword', async ({ users }) => {
    test.setTimeout(120_000)
    const [a] = await users(1)
    const page = a.page

    await ensureWorkspace(page, 'Test Workspace')

    // Fresh workspace so the count starts at zero.
    const wsName = `Cap Test ${Date.now()}`
    await page.getByTestId('workspace-switcher').click()
    await page.getByTestId('workspace-create-item').click()
    await page.getByTestId('workspace-name').fill(wsName)
    await page.getByTestId('create-workspace').click()

    await page.goto('/keywords')
    await expect(page.getByTestId('add-keyword')).toBeVisible({ timeout: 15_000 })

    const stamp = Date.now()
    async function addKeyword(term: string) {
      await page.getByTestId('add-keyword').click()
      await page.getByTestId('keyword-term').fill(term)
      await page.getByTestId('save-keyword').click()
      await expect(page.locator('[data-testid="keyword-row"]', { hasText: term })).toBeVisible({
        timeout: 15_000,
      })
    }

    try {
      // 1. Fill the allowance.
      for (let i = 1; i <= CAP; i++) await addKeyword(`zzqxv-cap-${i}-${stamp}`)
      await expect(page.getByTestId('keyword-cap-meta')).toContainText(`${CAP} / ${CAP} active`)

      // 2. At cap: Add is disabled and the upsell shows.
      await expect(page.getByTestId('add-keyword')).toBeDisabled()
      await expect(page.getByText('Upgrade for more keywords')).toBeVisible()

      // 3. Pausing one frees a slot.
      await page.getByRole('switch', { name: 'Pause keyword' }).first().click()
      await expect(page.getByTestId('keyword-cap-meta')).toContainText(`${CAP - 1} / ${CAP} active`)
      await expect(page.getByTestId('add-keyword')).toBeEnabled()

      // 4. Fill the slot again, then re-activating the paused one is blocked.
      await addKeyword(`zzqxv-cap-extra-${stamp}`)
      await expect(page.getByTestId('add-keyword')).toBeDisabled()
      await page.getByRole('switch', { name: 'Resume keyword' }).first().click()
      await expect(page.getByText('Keyword limit reached')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('keyword-cap-meta')).toContainText(`${CAP} / ${CAP} active`)
    } finally {
      // Delete the throwaway workspace (purges its keywords via the
      // delete-workspace machinery).
      await page.getByTestId('workspace-switcher').click()
      await page.getByTestId('workspace-delete-item').click()
      await page.getByTestId('delete-workspace-confirm').fill(wsName)
      await page.getByTestId('delete-workspace-submit').click()
      await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 20_000 })
    }
  })
})
