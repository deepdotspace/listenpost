import { test, expect } from 'deepspace/testing'
import { ensureWorkspace, wsSql } from './helpers/workspace'
import type { APIRequestContext } from '@playwright/test'

/**
 * Delete workspace — the owner can permanently remove a workspace from the
 * switcher dropdown (type-to-confirm gate). After deletion:
 *  - the registry row is gone,
 *  - the app re-selects another workspace the user can still enter,
 *  - the purge-workspace job wipes the tenant room's data (keywords,
 *    mentions, …) so the orphaned DO doesn't keep the storage forever.
 *
 * Runs single-user: the account owns the throwaway workspace it creates, so
 * the owner-only delete path (isOwner) is exercised end-to-end via real UI.
 */

/** Count workspace registry rows by name in the app room (default debug room). */
async function workspaceRowCount(request: APIRequestContext, name: string): Promise<number> {
  const res = await request.post('/api/debug/sql', {
    data: { sql: 'SELECT _row_id FROM c_workspaces WHERE col_name = ?', params: [name] },
  })
  const json = (await res.json()) as { rows?: unknown[] }
  return (json.rows ?? []).length
}

test.describe('Delete workspace', () => {
  test('owner deletes a workspace and the app re-selects another', async ({ users, request }) => {
    test.setTimeout(120_000)
    const [a] = await users(1)

    // Make sure the account has a stable "home" workspace to fall back to.
    const homeId = await ensureWorkspace(a.page, 'Test Workspace')

    // Create a throwaway workspace via the switcher; it auto-selects.
    const doomed = `Delete Me ${Date.now()}`
    await a.page.getByTestId('workspace-switcher').click()
    await a.page.getByTestId('workspace-create-item').click()
    await a.page.getByTestId('workspace-name').fill(doomed)
    await a.page.getByTestId('create-workspace').click()

    // Wait until the new workspace is the selected one.
    await expect
      .poll(async () => workspaceRowCount(request, doomed), { timeout: 20_000 })
      .toBe(1)
    const doomedId = await a.page.evaluate(() => localStorage.getItem('listenpost-workspace'))
    expect(doomedId).not.toBe(homeId)
    if (!doomedId) throw new Error('no selected workspace id')

    // Seed tenant data directly into the doomed room (no crawling/scoring):
    // inactive keywords with no sources, and mentions that reference them.
    const now = new Date().toISOString()
    const stamp = Date.now()
    for (let i = 0; i < 3; i++) {
      const kwId = `seed-kw-${i}-${stamp}`
      await wsSql(
        request,
        doomedId,
        `INSERT INTO c_keywords (_row_id, _created_by, _created_at, _updated_at, col_term, col_is_active, col_sources)
         VALUES (?, ?, ?, ?, ?, 0, '[]')`,
        [kwId, 'purge-test', now, now, `seed-term-${i}-${stamp}`],
      )
      await wsSql(
        request,
        doomedId,
        `INSERT INTO c_mentions (_row_id, _created_by, _created_at, _updated_at, col_source, col_source_id, col_keyword_id)
         VALUES (?, ?, ?, ?, 'hackernews', ?, ?)`,
        [`seed-mn-${i}-${stamp}`, 'purge-test', now, now, `seed-src-${i}-${stamp}`, kwId],
      )
    }
    const roomCount = async (table: string) =>
      (
        (await wsSql(request, doomedId, `SELECT COUNT(*) AS n FROM ${table}`)) as Array<{
          n: number
        }>
      )[0]?.n ?? 0
    expect(await roomCount('c_keywords')).toBe(3)
    expect(await roomCount('c_mentions')).toBe(3)

    // Delete it: switcher → Delete workspace → type-to-confirm.
    await a.page.getByTestId('workspace-switcher').click()
    await a.page.getByTestId('workspace-delete-item').click()
    const dialog = a.page.locator('dialog[open]')
    await expect(dialog.getByText(`Delete ${doomed}?`)).toBeVisible({ timeout: 10_000 })
    // The destructive button stays disabled until the exact name is typed.
    await expect(a.page.getByTestId('delete-workspace-submit')).toBeDisabled()
    await a.page.getByTestId('delete-workspace-confirm').fill(doomed)
    await expect(a.page.getByTestId('delete-workspace-submit')).toBeEnabled()
    await a.page.getByTestId('delete-workspace-submit').click()

    // Registry row is gone…
    await expect
      .poll(async () => workspaceRowCount(request, doomed), { timeout: 20_000 })
      .toBe(0)

    // …the purge-workspace job wipes the tenant room's data…
    await expect.poll(() => roomCount('c_keywords'), { timeout: 45_000 }).toBe(0)
    await expect.poll(() => roomCount('c_mentions'), { timeout: 45_000 }).toBe(0)

    // …and the selection re-points to a workspace the user can still enter
    // (never the deleted one), so the app doesn't hang on a dead tenant.
    await expect
      .poll(() => a.page.evaluate(() => localStorage.getItem('listenpost-workspace')), {
        timeout: 15_000,
      })
      .not.toBe(doomedId)
  })
})
