/**
 * X (Twitter) and LinkedIn partial fetchers — SerpAPI web search over
 * Google-indexed public posts (`site:x.com`, `site:linkedin.com`).
 *
 * BEST-EFFORT by design: neither platform offers a clean ingestion API,
 * so coverage is whatever Google has indexed — labeled as partial in the
 * UI. Owner-billed ($0.025/call) → 6-hour poll cadence.
 *
 * Google results carry no reliable timestamps, so there is no cursor;
 * dedupe by URL keeps re-polls idempotent.
 */

import type { SourceFetcher, NewMention, FetchResult } from './types'
import type { CronContext } from './context'

interface SerpResult {
  link?: string
  title?: string
  snippet?: string
  date?: string
}

async function serpSiteSearch(
  ctx: CronContext,
  source: 'x' | 'linkedin',
  site: string,
  term: string,
): Promise<FetchResult> {
  const reply = (await ctx.integrations.call('serpapi/web-search', {
    q: `site:${site} "${term}"`,
    num: 10,
  })) as { organic_results?: SerpResult[] }

  const items: NewMention[] = []
  for (const result of reply.organic_results ?? []) {
    if (!result.link) continue
    items.push({
      source,
      source_id: result.link,
      author: '',
      author_url: '',
      url: result.link,
      title: result.title ?? '',
      body: result.snippet ?? '',
      published_at: result.date ? new Date(result.date).toISOString() : '',
      engagement: {},
    })
  }
  return { items }
}

export const xFetcher: SourceFetcher = {
  id: 'x',
  minIntervalMinutes: 360,
  fetch: (term, _cursor, ctx) => serpSiteSearch(ctx, 'x', 'x.com', term),
}

export const linkedinFetcher: SourceFetcher = {
  id: 'linkedin',
  minIntervalMinutes: 360,
  fetch: (term, _cursor, ctx) => serpSiteSearch(ctx, 'linkedin', 'linkedin.com', term),
}
