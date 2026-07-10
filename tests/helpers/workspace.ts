import type { APIRequestContext, Page } from '@playwright/test'

/**
 * Tenancy test helpers.
 *
 * `ensureWorkspace` drives the real onboarding UI: if the signed-in user has
 * no workspace, it creates one; either way it returns the selected
 * workspace's id (from localStorage, where WorkspaceProvider persists it).
 *
 * `seedSharedWorkspace` writes a workspace row directly via the dev-only
 * debug SQL route — used by multi-user specs that need two pool users in
 * ONE workspace without driving the invite UI.
 */

export async function ensureWorkspace(page: Page, name = 'Test Workspace'): Promise<string> {
  await page.goto('/mentions')

  const nameInput = page.getByTestId('workspace-name')
  const nav = page.getByTestId('app-navigation')
  await Promise.race([
    nameInput.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
  ])

  if (await nameInput.isVisible().catch(() => false)) {
    // No workspace yet → drive onboarding; createWorkspace() persists the id.
    await nameInput.fill(name)
    await page.getByTestId('create-workspace').click()
  } else {
    // The user already has ≥1 visible workspace (e.g. a shared tenant seeded by
    // a multi-user spec, or a leftover from a prior run), but storageState is a
    // sign-in-era snapshot, so localStorage carries no persisted selection.
    // Single-user specs need an OWNED workspace (owner → ws-room admin):
    // reuse the account's named test workspace when it exists — creating a
    // fresh one per run made pool accounts accumulate dozens — else create it.
    const persisted = await page.evaluate(() => localStorage.getItem('listenpost-workspace'))
    if (!persisted) {
      await page.getByTestId('workspace-switcher').click()
      const existing = page.getByRole('menuitem', { name, exact: true })
      if (await existing.count()) {
        await existing.first().click()
      } else {
        await page.getByTestId('workspace-create-item').click()
        await page.getByTestId('workspace-name').fill(name)
        await page.getByTestId('create-workspace').click()
      }
    }
  }

  await page.waitForFunction(() => !!localStorage.getItem('listenpost-workspace'), undefined, {
    timeout: 15_000,
  })
  const id = await page.evaluate(() => localStorage.getItem('listenpost-workspace'))
  if (!id) throw new Error('no workspace id in localStorage after ensureWorkspace')
  return id
}

/** userId for a pool account (users collection recordId == userId). */
export async function userIdByEmail(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post('/api/debug/sql', {
    data: { sql: 'SELECT _row_id FROM c_users WHERE col_email = ?', params: [email] },
  })
  const json = (await res.json()) as { rows?: Array<{ _row_id: string }> }
  const id = json.rows?.[0]?._row_id
  if (!id) throw new Error(`no user row for ${email} — has the account signed in once?`)
  return id
}

/** Create (or replace) a workspace owned by `ownerId` with the given members. */
export async function seedSharedWorkspace(
  request: APIRequestContext,
  wsId: string,
  ownerId: string,
  memberIds: string[],
  name = 'Shared Test Workspace',
): Promise<void> {
  const now = new Date().toISOString()
  const members = JSON.stringify(Array.from(new Set([ownerId, ...memberIds])))
  await request.post('/api/debug/sql', {
    data: {
      sql: `INSERT OR REPLACE INTO c_workspaces
              (_row_id, _created_by, _created_at, _updated_at,
               col_name, col_owner_user, col_member_ids, col_is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      params: [wsId, ownerId, now, now, name, ownerId, members],
    },
  })
}

/** Point the page at a specific workspace id (must be visible to the user). */
export async function selectWorkspace(page: Page, wsId: string): Promise<void> {
  await page.evaluate((id) => localStorage.setItem('listenpost-workspace', id), wsId)
}

/** Run a debug-SQL statement against a workspace room. */
export async function wsSql(
  request: APIRequestContext,
  wsId: string,
  sql: string,
  params: unknown[] = [],
): Promise<unknown[]> {
  const res = await request.post(`/api/debug/sql?room=${encodeURIComponent(`ws:${wsId}`)}`, {
    data: { sql, params },
  })
  const json = (await res.json()) as { rows?: unknown[] }
  return json.rows ?? []
}
