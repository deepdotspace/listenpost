import { test, expect } from 'deepspace/testing'
import { ensureWorkspace, wsSql } from './helpers/workspace'
import http from 'node:http'
import { createHmac } from 'node:crypto'
import type { AddressInfo } from 'node:net'

/**
 * Phase 6 verification — outbound webhooks, full pipeline:
 * keyword → cron ingest → AI scoring → evaluateDeliveries → HMAC-signed
 * POST to a real local receiver started by this spec.
 */

const TERM = 'javascript'

interface Received {
  body: string
  signature: string | undefined
}

test.describe('Webhook delivery', () => {
  test('scored mentions are delivered, HMAC-signed, to a configured endpoint', async ({
    users,
    request,
  }) => {
    test.setTimeout(240_000)

    // Local receiver the worker will POST to.
    const received: Received[] = []
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        received.push({ body, signature: req.headers['x-octolens-signature'] as string | undefined })
        res.writeHead(200).end('ok')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    const [user] = await users(1)
    const { page } = user
    let wsId = ''

    try {
      // Workspace OWNERS are admin inside their tenant room (the /ws gate
      // upserts the role on connect), so the owner can manage webhook
      // endpoints without any elevation — this is the product behavior.
      wsId = await ensureWorkspace(page)

      // 1. Configure the endpoint via the UI, capturing the signing secret.
      await page.goto('/alerts')
      await expect(page.getByTestId('add-endpoint')).toBeVisible({ timeout: 15000 })
      await page.getByTestId('add-endpoint').click()
      await page.getByTestId('endpoint-url').fill(`http://127.0.0.1:${port}/hook`)
      const secret = await page.locator('input[readonly]').inputValue()
      expect(secret).toMatch(/^whsec_/)
      await page.getByTestId('save-endpoint').click()
      await expect(page.locator('[data-testid="endpoint-row"]')).toBeVisible()

      // 2. Create a keyword and trigger ingestion.
      await page.goto('/keywords')
      await page.getByTestId('add-keyword').click()
      await page.getByTestId('keyword-term').fill(TERM)
      await page.getByTestId('save-keyword').click()
      await page.goto('/cron-log')
      const runNow = page.getByRole('button', { name: 'Run now: poll-sources' })
      await expect(runNow).toBeVisible({ timeout: 15000 })
      await runNow.click()

      // 3. Wait for the first delivery to land on the receiver.
      await expect
        .poll(() => received.length, { timeout: 180_000, intervals: [2000] })
        .toBeGreaterThan(0)

      // 4. Payload shape + signature verify against the captured secret.
      const first = received[0]
      const parsed = JSON.parse(first.body) as { event: string; mention: { source: string } }
      expect(parsed.event).toBe('mention.scored')
      expect(parsed.mention.source).toBe('hackernews')
      const expected = 'sha256=' + createHmac('sha256', secret).update(first.body).digest('hex')
      expect(first.signature).toBe(expected)
    } finally {
      server.close()
      // Remove everything this spec created (tenant-scoped collections). The
      // ws-room role reverts implicitly — the workspace is created fresh per run.
      if (wsId) {
        await wsSql(request, wsId, `DELETE FROM c_webhook_endpoints`)
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
    }
  })
})

