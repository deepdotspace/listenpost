import { test } from 'deepspace/testing'
import { ensureWorkspace, wsSql } from './helpers/workspace'
import type { APIRequestContext } from '@playwright/test'

/** Populate the audited workspace so screenshots aren't empty states. */
async function seedDemo(request: APIRequestContext, wsId: string) {
  const now = new Date().toISOString()
  await wsSql(
    request,
    wsId,
    `INSERT OR IGNORE INTO c_keywords (_row_id,_created_by,_created_at,_updated_at,col_term,col_keyword_type,col_brand_context,col_sources,col_is_active,col_created_by_user)
     VALUES ('demo-kw-1','seed',?,?,'listenpost','brand','AI keyword monitoring for devtools teams.','["hackernews","reddit","bluesky"]',1,'seed')`,
    [now, now],
  )
  const rows: Array<[string, string, string, string, string, string, string, string, string, string]> = [
    ['reddit', 'r1', 'Anyone using Listenpost for brand monitoring?', 'Evaluating a few social listening tools for our devtools startup.', 'u/throwaway_dev', 'high', 'neutral', 'new', '{"points":142,"comments":38}', '["buying_intent","question"]'],
    ['bluesky', 'b1', 'just switched from Mention to Listenpost', 'half the mentions I used to triage manually never even reach me now.', '@maria.bsky', 'high', 'positive', 'new', '{"likes":56}', '["praise"]'],
    ['hackernews', 'h1', 'Show HN: social listening with AI relevance scoring', 'It watches Reddit, HN, Bluesky and GitHub for keywords.', 'pg_fan', 'high', 'positive', 'assigned', '{"points":89,"comments":41}', '["competitor_mention"]'],
    ['github', 'g1', 'Feature request: scheduled Slack digest', 'Would love a daily Slack digest instead of per-mention alerts.', 'octocat', 'medium', 'neutral', 'assigned', '{"replies":12}', '["feature_request"]'],
    ['youtube', 'y1', 'Top 5 Social Listening Tools in 2026', 'A full walkthrough comparing pricing, sources, and AI scoring.', 'TechReviewsDaily', 'medium', 'positive', 'resolved', '{"views":4200}', '["comparison"]'],
    ['reddit', 'r4', 'Their webhook alerts have been flaky for weeks', 'Actively looking at alternatives, open to suggestions.', 'r/devtools', 'high', 'negative', 'new', '{"points":56,"comments":34}', '["churn_risk","complaint"]'],
  ]
  let h = 1
  for (const [src, sfx, title, body, author, rel, sent, mstatus, eng, tags] of rows) {
    const ts = new Date(Date.now() - h++ * 3600_000).toISOString()
    await wsSql(
      request,
      wsId,
      `INSERT OR REPLACE INTO c_mentions (_row_id,_created_by,_created_at,_updated_at,col_source,col_source_id,col_keyword_id,col_title,col_body,col_url,col_author,col_published_at,col_relevance,col_relevance_score,col_sentiment,col_tags,col_status,col_engagement)
       VALUES (?, 'seed', ?, ?, ?, ?, 'demo-kw-1', ?, ?, ?, ?, ?, ?, 0.8, ?, ?, ?, ?)`,
      [`demo-m-${sfx}`, ts, ts, src, `demo-${sfx}`, title, body, `https://example.com/${sfx}`, author, ts, rel, tags, sent, mstatus, eng],
    )
  }
}

/**
 * Local UX audit helper — signed-in screenshots of every page against the
 * dev server. Runs only when AUDIT_DIR is set:
 *
 *   AUDIT_DIR=/tmp/audit npx deepspace test tests/local-audit.spec.ts --port 5174
 */

const OUT = process.env.AUDIT_DIR

const PAGES: Array<{ path: string; name: string; settle?: number }> = [
  { path: '/mentions', name: 'mentions', settle: 3500 },
  { path: '/keywords', name: 'keywords' },
  { path: '/analytics', name: 'analytics', settle: 3000 },
  { path: '/alerts', name: 'alerts' },
  { path: '/api-keys', name: 'api-keys' },
  { path: '/pricing', name: 'pricing', settle: 3000 },
  { path: '/settings', name: 'settings' },
  { path: '/assistant', name: 'assistant', settle: 3000 },
]

test.describe('Local UX audit', () => {
  test.skip(() => !OUT, 'set AUDIT_DIR to run the audit')

  test('capture signed-in screenshots', async ({ users, request }) => {
    test.setTimeout(300_000)
    const [user] = await users(1)
    const { page } = user

    // Land in a workspace so pages render (not the onboarding screen), then
    // populate it so the screenshots show real content.
    const wsId = await ensureWorkspace(page)
    await seedDemo(request, wsId)

    await page.setViewportSize({ width: 1440, height: 900 })
    for (const p of PAGES) {
      await page.goto(p.path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(p.settle ?? 1800)
      await page.screenshot({ path: `${OUT}/desktop-${p.name}.png`, fullPage: true })
    }

    // Mentions alternate layouts (Feed / Board).
    await page.goto('/mentions', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    for (const layout of ['Feed', 'Board'] as const) {
      await page.getByRole('button', { name: layout, exact: true }).click()
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${OUT}/desktop-mentions-${layout.toLowerCase()}.png`, fullPage: true })
    }

    await page.setViewportSize({ width: 390, height: 844 })
    for (const name of ['mentions', 'keywords']) {
      await page.goto(`/${name}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${OUT}/mobile-${name}.png`, fullPage: true })
    }
  })
})
