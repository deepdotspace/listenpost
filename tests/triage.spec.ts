import { test, expect, type APIRequestContext } from 'deepspace/testing'
import { userIdByEmail, seedSharedWorkspace, selectWorkspace, wsSql } from './helpers/workspace'

/**
 * Phase 4 verification — the multiplayer triage cockpit.
 * User A resolves a mention; user B sees the change instantly over the
 * live subscription. Both users see each other in the presence bar.
 *
 * The mention is seeded via the dev-only debug SQL route (mentions are
 * server-ingested in production — clients can't create them). Under
 * tenancy, both users are placed in ONE shared workspace room and the
 * mention is seeded into that tenant room.
 */

const SOURCE_ID = `__test-${Date.now()}__`

async function seedMention(request: APIRequestContext, wsId: string) {
  const now = new Date().toISOString()
  await wsSql(
    request,
    wsId,
    `INSERT INTO c_mentions (_row_id, _created_by, _created_at, _updated_at,
        col_source, col_source_id, col_title, col_body, col_url,
        col_relevance, col_sentiment, col_status, col_tags)
      VALUES (?, 'test-seed', ?, ?, 'hackernews', ?, ?, ?, ?, 'high', 'negative', 'new', '[]')`,
    [
      `test-${SOURCE_ID}`,
      now,
      now,
      SOURCE_ID,
      `${SOURCE_ID} Our product broke after the update`,
      'Body text for the seeded triage mention.',
      'https://example.com/mention',
    ],
  )
}

async function cleanup(request: APIRequestContext, wsId: string) {
  await wsSql(request, wsId, `DELETE FROM c_mentions WHERE col_source_id = ?`, [SOURCE_ID])
}

test.describe('Multiplayer triage', () => {
  test('A resolves a mention, B sees it live; presence shows both', async ({ users, request }) => {
    test.setTimeout(90_000)
    const [a, b] = await users(2)
    const aId = await userIdByEmail(request, a.email)
    const bId = await userIdByEmail(request, b.email)
    const wsId = `triage-ws-${Date.now()}`
    await seedSharedWorkspace(request, wsId, aId, [bId])

    try {
      await seedMention(request, wsId)

      // Establish the app origin before touching localStorage, select the
      // shared tenant, then reload so WorkspaceProvider mounts into ws:<id>.
      await a.page.goto('/mentions')
      await b.page.goto('/mentions')
      await selectWorkspace(a.page, wsId)
      await selectWorkspace(b.page, wsId)
      await a.page.goto('/mentions')
      await b.page.goto('/mentions')

      const rowA = a.page.locator(`[data-testid="mention-row"][data-source-id="${SOURCE_ID}"]`)
      const rowB = b.page.locator(`[data-testid="mention-row"][data-source-id="${SOURCE_ID}"]`)
      await expect(rowA).toBeVisible({ timeout: 15000 })
      await expect(rowB).toBeVisible({ timeout: 15000 })

      // Presence: each user sees the other in the presence bar.
      await expect(a.page.getByTestId('presence-peer').first()).toBeVisible({ timeout: 15000 })
      await expect(b.page.getByTestId('presence-peer').first()).toBeVisible({ timeout: 15000 })

      // A resolves via the status menu → B sees the resolved state live.
      // (Menu items render in a body-level portal, so they're page-scoped.)
      await rowA.getByTestId('status-menu-trigger').click()
      await a.page.getByTestId('set-status-resolved').click()
      await expect(rowB).toHaveAttribute('data-status', 'resolved', { timeout: 10000 })
      await expect(rowB.getByTestId('status-badge')).toHaveText('resolved')

      // B leaves a note → A sees it (bidirectional sync). The note input is
      // behind a per-row toggle until a note exists.
      await rowB.getByTestId('note-toggle').click()
      await rowB.getByTestId('mention-notes').fill('checked — known issue')
      await rowB.getByTestId('mention-notes').blur()
      await expect(rowA.getByTestId('mention-notes')).toHaveValue('checked — known issue', {
        timeout: 10000,
      })
    } finally {
      await cleanup(request, wsId)
    }
  })
})
