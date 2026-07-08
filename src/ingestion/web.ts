/**
 * Broad-web fetcher — `exa/search` neural search (owner-billed at actual
 * cost), polled every 6 hours. Catches blogs, forums, and misc pages the
 * platform-specific fetchers miss. Cursor = newest publishedDate seen.
 */

import type { SourceFetcher, NewMention } from './types'

interface ExaResult {
  id?: string
  url?: string
  title?: string | null
  author?: string | null
  publishedDate?: string
  text?: string
}

const FIRST_POLL_BACKFILL_MS = 14 * 24 * 3600 * 1000

export const webFetcher: SourceFetcher = {
  id: 'web',
  minIntervalMinutes: 360,

  async fetch(term, cursor, ctx) {
    const since = cursor ? new Date(cursor).getTime() : Date.now() - FIRST_POLL_BACKFILL_MS

    const reply = (await ctx.integrations.call('exa/search', {
      query: term,
      numResults: 10,
      startPublishedDate: new Date(since + 1000).toISOString(),
    })) as { results?: ExaResult[] }

    let maxSeen = since
    const items: NewMention[] = []
    for (const result of reply.results ?? []) {
      if (!result.url) continue
      const published = result.publishedDate ? new Date(result.publishedDate).getTime() : 0
      if (published > maxSeen) maxSeen = published
      items.push({
        source: 'web',
        source_id: result.url,
        author: result.author ?? '',
        author_url: '',
        url: result.url,
        title: result.title ?? '',
        body: (result.text ?? '').slice(0, 4000),
        published_at: result.publishedDate ?? '',
        engagement: {},
      })
    }

    return { items, nextCursor: new Date(maxSeen).toISOString() }
  },
}
