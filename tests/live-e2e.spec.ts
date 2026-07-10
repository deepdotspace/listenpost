import { test, expect } from '@playwright/test'
import { loadAllTestAccounts } from 'deepspace/testing'
import { ensureWorkspace } from './helpers/workspace'

/**
 * Live end-to-end (Phase 10 launch verification) — against the DEPLOYED app.
 *
 * sign in → add keyword → trigger crawl → mentions arrive → AI-scored.
 * The keyword ("durable objects") is intentionally left in place afterwards:
 * it doubles as demo content for the showcase. Prod has no debug routes, so
 * mentions can't be bulk-deleted here anyway — that's correct security.
 *
 * Excluded from the default suite (playwright.config.ts matches *.spec.ts in
 * testDir root only via testMatch **, so this file IS matched — hence the
 * `live` tag gate below keyed on the config's baseURL).
 */

const DEMO_TERM = 'durable objects'

test.describe('Live production e2e', () => {
  test.skip(
    ({ baseURL }) => !baseURL?.includes('octolens-clone.app.space'),
    'live-only: run with --config tests/live.config.ts',
  )

  test('sign in → keyword → crawl → scored mentions', async ({ browser, baseURL }) => {
    const [account] = loadAllTestAccounts()
    expect(account, 'test-accounts pool is empty — run `deepspace test-accounts list`').toBeTruthy()

    const ctx = await browser.newContext({ baseURL })
    const page = await ctx.newPage()

    try {
      // Sign in the same way the SDK's harness does — a same-origin fetch.
      await page.goto('/')
      const ok = await page.evaluate(
        async ({ email, password }) => {
          const res = await fetch('/api/auth/sign-in/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          return res.ok
        },
        { email: account.email, password: account.password },
      )
      expect(ok, `sign-in failed for ${account.email}`).toBe(true)

      // Signed-in users need a workspace before protected pages render; drive
      // onboarding (idempotent) and select the tenant for the rest of the run.
      await ensureWorkspace(page)

      // Signed-in users get redirected off the landing to the live feed.
      await page.goto('/')
      await expect(page).toHaveURL(/\/mentions/, { timeout: 20_000 })

      // Ensure the demo keyword exists (idempotent across runs).
      await page.goto('/keywords')
      await expect(page.getByTestId('add-keyword')).toBeVisible({ timeout: 20_000 })
      const existing = page.locator('[data-testid="keyword-row"]', { hasText: DEMO_TERM })
      if ((await existing.count()) === 0) {
        await page.getByTestId('add-keyword').click()
        await page.getByTestId('keyword-term').fill(DEMO_TERM)
        await page
          .getByTestId('keyword-context')
          .fill(
            'Octolens is a DeepSpace SDK showcase; Cloudflare Durable Objects discussions are exactly our audience.',
          )
        await page.getByTestId('save-keyword').click()
        await expect(existing.first()).toBeVisible()
      }

      // Trigger the crawl now instead of waiting for the 5-minute alarm.
      await page.goto('/cron-log')
      const runNow = page.getByRole('button', { name: 'Run now: poll-sources' })
      await expect(runNow).toBeVisible({ timeout: 20_000 })
      await runNow.click()

      // Mentions arrive in the live feed…
      await page.goto('/mentions')
      const hnRows = page.locator('[data-testid="mention-row"]', { hasText: 'hackernews' })
      await expect(hnRows.first()).toBeVisible({ timeout: 120_000 })

      // …and the AI scorer flips them from pending to a verdict, live.
      const scoredRow = page.locator(
        '[data-testid="mention-row"]:not([data-relevance="pending"])',
      )
      await expect(scoredRow.first()).toBeVisible({ timeout: 180_000 })
    } finally {
      await ctx.close()
    }
  })
})
