import { test, expect } from 'deepspace/testing'

/**
 * Phase 2 verification — the poll-sources cron ingests real HN mentions
 * for an active keyword. Uses a real, high-volume term because the
 * fetcher hits the live Algolia HN API (no mocks by convention).
 * Cleanup deletes the keyword and everything ingested for it via the
 * dev-only /api/debug/sql route.
 */

const TERM = 'javascript'

test.describe('HN ingestion', () => {
  // Real HN fetch + AI scoring jobs — needs headroom beyond the 30s default.
  test('poll-sources cron inserts mentions for an active keyword', async ({ users, request }) => {
    test.setTimeout(240_000)
    const [user] = await users(1)
    const { page } = user

    try {
      // 1. Create the keyword (HN source is on by default).
      await page.goto('/keywords')
      await expect(page.getByTestId('add-keyword')).toBeVisible({ timeout: 15000 })
      await page.getByTestId('add-keyword').click()
      await page.getByTestId('keyword-term').fill(TERM)
      await page.getByTestId('save-keyword').click()
      await expect(page.locator('[data-testid="keyword-row"]', { hasText: TERM }).first()).toBeVisible()

      // 2. Trigger the cron task manually (no waiting for the 5-min alarm).
      await page.goto('/cron-log')
      const runNow = page.getByRole('button', { name: 'Run now: poll-sources' })
      await expect(runNow).toBeVisible({ timeout: 15000 })
      await runNow.click()

      // 3. Mentions arrive in the live feed — proof the task ran end-to-end.
      //    (Asserting on the outcome, not the cron-history row: dev-server
      //    restarts can sever the cron WS and make the row assertion flaky.)
      await page.goto('/mentions')
      const rows = page.locator('[data-testid="mention-row"]', { hasText: 'hackernews' })
      await expect(rows.first()).toBeVisible({ timeout: 90000 })

      // 4. AI scoring flips pending → scored live (score-mention job ran).
      const scored = page.locator('[data-testid="mention-row"]', { hasText: /relevance: (high|medium|low)/ })
      await expect(scored.first()).toBeVisible({ timeout: 120000 })
    } finally {
      // Cleanup: remove the keyword and everything ingested for it.
      const sel = await request.post('/api/debug/sql', {
        data: { sql: `SELECT _row_id FROM c_keywords WHERE col_term = ?`, params: [TERM] },
      })
      const selJson = (await sel.json()) as { rows?: Array<{ _row_id: string }> }
      for (const row of selJson.rows ?? []) {
        for (const sql of [
          `DELETE FROM c_mentions WHERE col_keyword_id = ?`,
          `DELETE FROM c_sources_state WHERE col_keyword_id = ?`,
          `DELETE FROM c_keywords WHERE _row_id = ?`,
        ]) {
          await request.post('/api/debug/sql', { data: { sql, params: [row._row_id] } })
        }
      }
    }
  })
})
