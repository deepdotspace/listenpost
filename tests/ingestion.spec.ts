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
  test('poll-sources cron inserts mentions for an active keyword', async ({ users, request }) => {
    const [user] = await users(1)
    const { page } = user

    try {
      // 1. Create the keyword (HN source is on by default).
      await page.goto('/keywords')
      await expect(page.getByTestId('add-keyword')).toBeVisible({ timeout: 15000 })
      await page.getByTestId('add-keyword').click()
      await page.getByTestId('keyword-term').fill(TERM)
      await page.getByTestId('save-keyword').click()
      await expect(page.locator('[data-testid="keyword-row"]', { hasText: TERM })).toBeVisible()

      // 2. Trigger the cron task and wait for a successful run to land.
      await page.goto('/cron-log')
      const runNow = page.getByRole('button', { name: 'Run now: poll-sources' })
      await expect(runNow).toBeVisible({ timeout: 15000 })
      await runNow.click()
      await expect(
        page.locator('[data-testid="cron-log-row"][data-task="poll-sources"][data-success="1"]'),
      ).toBeVisible({ timeout: 45000 })

      // 3. Mentions arrived and are visible in the feed.
      await page.goto('/mentions')
      const rows = page.locator('[data-testid="mention-row"]', { hasText: 'hackernews' })
      await expect(rows.first()).toBeVisible({ timeout: 15000 })
    } finally {
      // Cleanup: remove the keyword and everything ingested for it.
      const sel = await request.post('/api/debug/sql', {
        data: { sql: `SELECT record_id FROM c_keywords WHERE col_term = ?`, params: [TERM] },
      })
      const selJson = (await sel.json()) as { results?: Array<{ record_id: string }> }
      for (const row of selJson.results ?? []) {
        for (const sql of [
          `DELETE FROM c_mentions WHERE col_keyword_id = ?`,
          `DELETE FROM c_sources_state WHERE col_keyword_id = ?`,
          `DELETE FROM c_keywords WHERE record_id = ?`,
        ]) {
          await request.post('/api/debug/sql', { data: { sql, params: [row.record_id] } })
        }
      }
    }
  })
})
