import { test, expect, type APIRequestContext } from 'deepspace/testing'

/**
 * Phase 7 verification — the Octolens-style data-layer REST API.
 * Key generated via the UI (raw shown once), used as a Bearer token,
 * filtered queries return the documented shape, revocation 401s.
 */

const SOURCE_ID = `__apitest-${Date.now()}__`

async function seedMention(request: APIRequestContext, sentiment: string, suffix: string) {
  const now = new Date().toISOString()
  await request.post('/api/debug/sql', {
    data: {
      sql: `INSERT INTO c_mentions (_row_id, _created_by, _created_at, _updated_at,
              col_source, col_source_id, col_title, col_body, col_url,
              col_relevance, col_sentiment, col_status, col_tags)
            VALUES (?, 'test-seed', ?, ?, 'hackernews', ?, ?, 'body', 'https://example.com',
              'high', ?, 'new', '["bug_report"]')`,
      params: [`row-${SOURCE_ID}-${suffix}`, now, now, `${SOURCE_ID}-${suffix}`, `Title ${suffix}`, sentiment],
    },
  })
}

test.describe('Data-layer API', () => {
  test('bearer auth, filters, shape, and revocation', async ({ users, request }) => {
    test.setTimeout(60_000)

    // No key → 401. Malformed key → 401.
    expect((await request.post('/api/v2/mentions', { data: {} })).status()).toBe(401)
    expect(
      (
        await request.post('/api/v2/mentions', {
          data: {},
          headers: { Authorization: 'Bearer olk_deadbeef' },
        })
      ).status(),
    ).toBe(401)

    const [user] = await users(1)
    const { page } = user

    try {
      await seedMention(request, 'negative', 'neg')
      await seedMention(request, 'positive', 'pos')

      // Generate a key through the UI; capture the one-time raw key.
      await page.goto('/api-keys')
      await expect(page.getByTestId('key-label')).toBeVisible({ timeout: 15000 })
      await page.getByTestId('key-label').fill('e2e test key')
      await page.getByTestId('generate-key').click()
      await expect(page.getByTestId('raw-key')).toContainText('olk_', { timeout: 15000 })
      const rawKey = (await page.getByTestId('raw-key').textContent())?.trim()
      expect(rawKey).toMatch(/^olk_[0-9a-f]{48}$/)
      await page.getByRole('button', { name: 'Done' }).click()

      // Authorized query with a sentiment filter → only the negative seed.
      const res = await request.post('/api/v2/mentions', {
        headers: { Authorization: `Bearer ${rawKey}` },
        data: { filters: { sentiment: ['negative'] }, limit: 50 },
      })
      expect(res.status()).toBe(200)
      const json = (await res.json()) as {
        mentions: Array<{ id: string; source: string; sentiment: string; tags: string[]; timestamp: string }>
      }
      const seeded = json.mentions.filter((m) => m.id.startsWith(`row-${SOURCE_ID}`))
      expect(seeded.length).toBe(1)
      expect(seeded[0].sentiment).toBe('negative')
      expect(seeded[0].source).toBe('hackernews')
      expect(seeded[0].tags).toEqual(['bug_report'])
      expect(seeded[0].timestamp).toBeTruthy()

      // Cursor pagination: limit 1 with no filters yields a nextCursor when
      // more rows exist, and page 2 differs from page 1.
      const page1 = (await (
        await request.post('/api/v2/mentions', {
          headers: { Authorization: `Bearer ${rawKey}` },
          data: { limit: 1 },
        })
      ).json()) as { mentions: Array<{ id: string }>; nextCursor?: string }
      expect(page1.mentions.length).toBe(1)
      expect(page1.nextCursor).toBeTruthy()
      const page2 = (await (
        await request.post('/api/v2/mentions', {
          headers: { Authorization: `Bearer ${rawKey}` },
          data: { limit: 1, cursor: page1.nextCursor },
        })
      ).json()) as { mentions: Array<{ id: string }> }
      expect(page2.mentions[0]?.id).not.toBe(page1.mentions[0].id)

      // Revoke via UI → immediate 401.
      await page.getByTestId('revoke-key').first().click()
      await page.locator('dialog[open]').getByRole('button', { name: 'Revoke' }).click()
      await expect(page.getByTestId('key-row')).toHaveCount(0, { timeout: 10000 })
      const after = await request.post('/api/v2/mentions', {
        headers: { Authorization: `Bearer ${rawKey}` },
        data: {},
      })
      expect(after.status()).toBe(401)
    } finally {
      await request.post('/api/debug/sql', {
        data: { sql: `DELETE FROM c_mentions WHERE col_source_id LIKE ?`, params: [`${SOURCE_ID}%`] },
      })
      await request.post('/api/debug/sql', {
        data: { sql: `DELETE FROM c_api_keys WHERE col_label = 'e2e test key'` },
      })
    }
  })
})
