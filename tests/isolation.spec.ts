import { test, expect } from 'deepspace/testing'
import { ensureWorkspace, wsSql } from './helpers/workspace'

/**
 * Tenancy isolation — the security property that makes this a real product:
 * one user's workspace data must be completely invisible to a user who
 * isn't a member, even though both sign into the same app.
 *
 * User A creates a workspace and a keyword in it. User B (a different pooled
 * account, NOT invited) creates their own workspace. B must never see A's
 * keyword or mentions — the /ws/:roomId gate 403s B's socket to A's room,
 * and the app auto-selects only B's own workspace.
 */

test.describe('Workspace isolation', () => {
  test("user B cannot see user A's workspace data", async ({ users, request }) => {
    test.setTimeout(120_000)
    const [a, b] = await users(2)

    const aWs = await ensureWorkspace(a.page, `A-only ${Date.now()}`)
    const bWs = await ensureWorkspace(b.page, `B-only ${Date.now()}`)
    expect(aWs).not.toBe(bWs)

    const secretTerm = `__secret-${Date.now()}__`
    try {
      // A adds a keyword in A's workspace via the real UI.
      await a.page.goto('/keywords')
      await expect(a.page.getByTestId('add-keyword')).toBeVisible({ timeout: 15000 })
      await a.page.getByTestId('add-keyword').click()
      await a.page.getByTestId('keyword-term').fill(secretTerm)
      await a.page.getByTestId('save-keyword').click()
      await expect(
        a.page.locator('[data-testid="keyword-row"]', { hasText: secretTerm }),
      ).toBeVisible()

      // The row physically exists in A's room…
      const inA = await wsSql(request, aWs, 'SELECT _row_id FROM c_keywords WHERE col_term = ?', [
        secretTerm,
      ])
      expect(inA.length).toBe(1)
      // …and not in B's room.
      const inB = await wsSql(request, bWs, 'SELECT _row_id FROM c_keywords WHERE col_term = ?', [
        secretTerm,
      ])
      expect(inB.length).toBe(0)

      // B loads keywords: A's secret term must be nowhere on the page.
      await b.page.goto('/keywords')
      await expect(b.page.getByTestId('add-keyword')).toBeVisible({ timeout: 15000 })
      await b.page.waitForTimeout(1500) // let any (forbidden) sync settle
      await expect(b.page.getByText(secretTerm)).toHaveCount(0)
      await expect(
        b.page.locator('[data-testid="keyword-row"]', { hasText: secretTerm }),
      ).toHaveCount(0)

      // Direct socket attempt: B selecting A's workspace id must be refused
      // (the worker gate 403s a non-member), so B still sees no such keyword.
      await b.page.evaluate((id) => localStorage.setItem('listenpost-workspace', id), aWs)
      await b.page.goto('/keywords')
      await b.page.waitForTimeout(2000)
      await expect(b.page.getByText(secretTerm)).toHaveCount(0)
    } finally {
      await wsSql(request, aWs, 'DELETE FROM c_keywords WHERE col_term = ?', [secretTerm])
      // Leave the per-user workspaces — pooled accounts reuse them across runs.
    }
  })
})
