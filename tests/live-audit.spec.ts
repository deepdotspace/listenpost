import { test } from '@playwright/test'
import { loadAllTestAccounts } from 'deepspace/testing'
import { ensureWorkspace } from './helpers/workspace'

/**
 * UX audit helper — signs in on the LIVE app as the first pooled test
 * account and captures full-page screenshots of every page (desktop +
 * mobile) into the directory given by AUDIT_DIR. Not a test suite;
 * excluded from normal runs by the baseURL guard.
 *
 *   AUDIT_DIR=/tmp/audit npx playwright test --config tests/live.config.ts tests/live-audit.spec.ts
 */

const OUT = process.env.AUDIT_DIR ?? 'test-results/audit'

const PAGES: Array<{ path: string; name: string; settle?: number }> = [
  { path: '/', name: 'landing-or-redirect', settle: 9000 },
  { path: '/mentions', name: 'mentions', settle: 4000 },
  { path: '/keywords', name: 'keywords', settle: 2000 },
  { path: '/analytics', name: 'analytics', settle: 4000 },
  { path: '/alerts', name: 'alerts', settle: 2000 },
  { path: '/api-keys', name: 'api-keys', settle: 2000 },
  { path: '/pricing', name: 'pricing', settle: 3000 },
  { path: '/settings', name: 'settings', settle: 2000 },
  { path: '/assistant', name: 'assistant', settle: 3000 },
  { path: '/admin', name: 'admin-as-member', settle: 2000 },
]

test.describe('Live UX audit', () => {
  test.skip(
    ({ baseURL }) => !baseURL?.includes('octolens-clone.app.space'),
    'live-only: run with --config tests/live.config.ts',
  )

  test('capture signed-in screenshots of every page', async ({ browser, baseURL }) => {
    test.setTimeout(600_000)
    const [account] = loadAllTestAccounts()

    const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

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
    if (!ok) throw new Error(`sign-in failed for ${account.email}`)

    await ensureWorkspace(page)

    for (const p of PAGES) {
      await page.goto(p.path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(p.settle ?? 2000)
      await page.screenshot({ path: `${OUT}/desktop-${p.name}.png`, fullPage: true })
    }

    // Mobile pass on the highest-traffic pages.
    await page.setViewportSize({ width: 390, height: 844 })
    for (const name of ['mentions', 'keywords', 'analytics']) {
      await page.goto(`/${name}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(3000)
      await page.screenshot({ path: `${OUT}/mobile-${name}.png`, fullPage: true })
    }

    await ctx.close()
  })
})
