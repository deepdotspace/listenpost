import { test, expect } from 'deepspace/testing'
import { ensureWorkspace, wsSql } from './helpers/workspace'

/**
 * Keyword lifecycle side effects, both without waiting for cron:
 *  - create → the sweepKeyword action triggers an immediate first crawl
 *  - delete → the purgeKeyword action clears its mentions + cursors
 * Unlike ingestion.spec.ts, this spec never touches the cron-log
 * "Run now" button: every effect it asserts on can only come from the
 * keyword actions (the assertion windows are far shorter than the
 * 5-minute cron interval).
 */

const TERM = 'javascript'

test.describe('Keyword lifecycle sweeps', () => {
  test('create crawls immediately; delete purges its mentions', async ({ users, request }) => {
    test.setTimeout(240_000)
    const [user] = await users(1)
    const { page } = user
    const wsId = await ensureWorkspace(page)

    try {
      // 1. Create the keyword (HN source is on by default) and capture the
      //    sweepKeyword action round-trip triggered by the save.
      await page.goto('/keywords')
      await expect(page.getByTestId('add-keyword')).toBeVisible({ timeout: 15000 })
      await page.getByTestId('add-keyword').click()
      await page.getByTestId('keyword-term').fill(TERM)
      const actionResponse = page.waitForResponse(
        (res) => res.url().includes('/api/actions/sweepKeyword') && res.request().method() === 'POST',
        { timeout: 20_000 },
      )
      await page.getByTestId('save-keyword').click()

      const res = await actionResponse
      expect(res.ok()).toBe(true)
      expect(await res.json()).toMatchObject({ success: true })

      // 2. The sweep persists a sources_state cursor for the new keyword —
      //    proof the fetch ran now, not on the next cron alarm.
      const [keywordRow] = (await wsSql(
        request,
        wsId,
        `SELECT _row_id FROM c_keywords WHERE col_term = ? ORDER BY _created_at DESC`,
        [TERM],
      )) as Array<{ _row_id: string }>
      expect(keywordRow).toBeTruthy()

      await expect
        .poll(
          async () =>
            (
              await wsSql(request, wsId, `SELECT _row_id FROM c_sources_state WHERE col_keyword_id = ?`, [
                keywordRow._row_id,
              ])
            ).length,
          { timeout: 60_000 },
        )
        .toBeGreaterThan(0)

      // 3. Mentions from the immediate sweep show up in the live feed.
      await page.goto('/mentions')
      const rows = page.locator('[data-testid="mention-row"]', { hasText: 'hackernews' })
      await expect(rows.first()).toBeVisible({ timeout: 60_000 })

      const mentionCount = async () =>
        (
          (await wsSql(request, wsId, `SELECT COUNT(*) AS n FROM c_mentions WHERE col_keyword_id = ?`, [
            keywordRow._row_id,
          ])) as Array<{ n: number }>
        )[0]?.n ?? 0
      expect(await mentionCount()).toBeGreaterThan(0)

      // 4. Delete the keyword via the UI and capture the purge round-trip.
      await page.goto('/keywords')
      const row = page.locator('[data-testid="keyword-row"]', { hasText: TERM }).first()
      await expect(row).toBeVisible({ timeout: 15000 })
      await row.getByRole('button', { name: 'Keyword actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      const purgeResponse = page.waitForResponse(
        (r) => r.url().includes('/api/actions/purgeKeyword') && r.request().method() === 'POST',
        { timeout: 20_000 },
      )
      await page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click()
      const purgeRes = await purgeResponse
      expect(purgeRes.ok()).toBe(true)
      expect(await purgeRes.json()).toMatchObject({ success: true })

      // 5. Its mentions and source cursors are gone — no cron involved.
      await expect.poll(mentionCount, { timeout: 30_000 }).toBe(0)
      await expect
        .poll(
          async () =>
            (
              await wsSql(request, wsId, `SELECT _row_id FROM c_sources_state WHERE col_keyword_id = ?`, [
                keywordRow._row_id,
              ])
            ).length,
          { timeout: 30_000 },
        )
        .toBe(0)
    } finally {
      // Cleanup: remove the keyword and everything ingested for it.
      const rows = (await wsSql(request, wsId, `SELECT _row_id FROM c_keywords WHERE col_term = ?`, [
        TERM,
      ])) as Array<{ _row_id: string }>
      for (const row of rows) {
        for (const sql of [
          `DELETE FROM c_mentions WHERE col_keyword_id = ?`,
          `DELETE FROM c_sources_state WHERE col_keyword_id = ?`,
          `DELETE FROM c_keywords WHERE _row_id = ?`,
        ]) {
          await wsSql(request, wsId, sql, [row._row_id])
        }
      }
    }
  })
})
