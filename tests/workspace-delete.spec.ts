import { test, expect } from 'deepspace/testing'
import { ensureWorkspace } from './helpers/workspace'
import type { APIRequestContext } from '@playwright/test'

/**
 * Delete workspace — the owner can permanently remove a workspace from the
 * switcher dropdown. After deletion the registry row is gone and the app
 * re-selects another workspace the user can still enter (no dead selection).
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

    // Delete it: switcher → Delete workspace → confirm.
    await a.page.getByTestId('workspace-switcher').click()
    await a.page.getByTestId('workspace-delete-item').click()
    const dialog = a.page.locator('dialog[open]')
    await expect(dialog.getByText(`Delete ${doomed}?`)).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Delete workspace' }).click()

    // Registry row is gone…
    await expect
      .poll(async () => workspaceRowCount(request, doomed), { timeout: 20_000 })
      .toBe(0)

    // …and the selection re-points to a workspace the user can still enter
    // (never the deleted one), so the app doesn't hang on a dead tenant.
    await expect
      .poll(() => a.page.evaluate(() => localStorage.getItem('listenpost-workspace')), {
        timeout: 15_000,
      })
      .not.toBe(doomedId)
  })
})
