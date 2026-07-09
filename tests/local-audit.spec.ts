import { test } from 'deepspace/testing'

/**
 * Local UX audit helper — signed-in screenshots of every page against the
 * dev server. Runs only when AUDIT_DIR is set:
 *
 *   AUDIT_DIR=/tmp/audit npx deepspace test tests/local-audit.spec.ts --port 5174
 */

const OUT = process.env.AUDIT_DIR

const PAGES: Array<{ path: string; name: string; settle?: number }> = [
  { path: '/mentions', name: 'mentions', settle: 3500 },
  { path: '/keywords', name: 'keywords' },
  { path: '/analytics', name: 'analytics', settle: 3000 },
  { path: '/alerts', name: 'alerts' },
  { path: '/api-keys', name: 'api-keys' },
  { path: '/pricing', name: 'pricing', settle: 3000 },
  { path: '/settings', name: 'settings' },
  { path: '/assistant', name: 'assistant', settle: 3000 },
]

test.describe('Local UX audit', () => {
  test.skip(() => !OUT, 'set AUDIT_DIR to run the audit')

  test('capture signed-in screenshots', async ({ users }) => {
    test.setTimeout(300_000)
    const [user] = await users(1)
    const { page } = user

    await page.setViewportSize({ width: 1440, height: 900 })
    for (const p of PAGES) {
      await page.goto(p.path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(p.settle ?? 1800)
      await page.screenshot({ path: `${OUT}/desktop-${p.name}.png`, fullPage: true })
    }

    // Mentions alternate layouts (Feed / Board).
    await page.goto('/mentions', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    for (const layout of ['Feed', 'Board'] as const) {
      await page.getByRole('button', { name: layout, exact: true }).click()
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${OUT}/desktop-mentions-${layout.toLowerCase()}.png`, fullPage: true })
    }

    await page.setViewportSize({ width: 390, height: 844 })
    for (const name of ['mentions', 'keywords']) {
      await page.goto(`/${name}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${OUT}/mobile-${name}.png`, fullPage: true })
    }
  })
})
