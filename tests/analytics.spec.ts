import { test, expect, type APIRequestContext } from 'deepspace/testing'
import { ensureWorkspace, wsSql } from './helpers/workspace'

/**
 * Phase 8 verification — analytics aggregates match the underlying
 * records and the time-range filter re-windows them.
 */

const MARK = `__analytics-${Date.now()}__`

async function seed(
  request: APIRequestContext,
  wsId: string,
  suffix: string,
  opts: { source: string; sentiment: string; daysAgo: number },
) {
  const at = new Date(Date.now() - opts.daysAgo * 24 * 3600_000).toISOString()
  await wsSql(
    request,
    wsId,
    `INSERT INTO c_mentions (_row_id, _created_by, _created_at, _updated_at,
        col_source, col_source_id, col_title, col_relevance, col_sentiment, col_status, col_tags)
      VALUES (?, 'test-seed', ?, ?, ?, ?, ?, 'high', ?, 'new', '[]')`,
    [`row-${MARK}-${suffix}`, at, at, opts.source, `${MARK}-${suffix}`, `T ${suffix}`, opts.sentiment],
  )
}

test.describe('Analytics', () => {
  test('aggregates match records; range filter re-windows', async ({ users, request }) => {
    const [user] = await users(1)
    const { page } = user
    const wsId = await ensureWorkspace(page)

    try {
      // Ensure a clean slate for exact-count assertions (tenant room).
      await wsSql(request, wsId, 'DELETE FROM c_mentions')
      await seed(request, wsId, 'a', { source: 'hackernews', sentiment: 'negative', daysAgo: 1 })
      await seed(request, wsId, 'b', { source: 'hackernews', sentiment: 'positive', daysAgo: 1 })
      await seed(request, wsId, 'c', { source: 'bluesky', sentiment: 'positive', daysAgo: 1 })
      await seed(request, wsId, 'old', { source: 'bluesky', sentiment: 'negative', daysAgo: 40 })

      await page.goto('/analytics')
      const tiles = page.getByTestId('stat-tiles')
      await expect(tiles).toBeVisible({ timeout: 15000 })

      // Default window (30d): 3 mentions, 1 negative.
      await expect(tiles.locator('div', { hasText: /^Mentions/ }).locator('p').nth(1)).toHaveText('3')
      await expect(tiles.locator('div', { hasText: /^Negative/ }).locator('p').nth(1)).toHaveText('1')

      // Volume by source matches counts.
      const sources = page.getByTestId('chart-sources')
      await expect(sources).toContainText('hackernews')
      await expect(sources).toContainText('bluesky')
      await sources.getByText('View as table').click()
      await expect(sources.locator('table')).toContainText('hackernews')
      const hnRow = sources.locator('tbody tr', { hasText: 'hackernews' })
      await expect(hnRow).toContainText('2')

      // 90-day window picks up the 40-day-old mention.
      await page.getByRole('button', { name: 'Last 90 days' }).click()
      await expect(tiles.locator('div', { hasText: /^Mentions/ }).locator('p').nth(1)).toHaveText('4')
      await expect(tiles.locator('div', { hasText: /^Negative/ }).locator('p').nth(1)).toHaveText('2')

      // 7-day window drops it again.
      await page.getByRole('button', { name: 'Last 7 days' }).click()
      await expect(tiles.locator('div', { hasText: /^Mentions/ }).locator('p').nth(1)).toHaveText('3')

      // Sentiment chart legend present (identity never color-alone).
      await expect(page.getByTestId('chart-sentiment')).toContainText('positive')
      await expect(page.getByTestId('chart-sentiment')).toContainText('negative')
    } finally {
      await wsSql(request, wsId, `DELETE FROM c_mentions WHERE col_source_id LIKE ?`, [`${MARK}%`])
    }
  })
})
