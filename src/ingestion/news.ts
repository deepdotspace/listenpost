/**
 * News fetcher — `newsapi/search-everything` integration (owner-billed,
 * $0.018/call), polled hourly. Cursor = newest publishedAt seen.
 */

import type { SourceFetcher, NewMention } from './types'

interface NewsArticle {
  url?: string
  title?: string
  description?: string | null
  content?: string | null
  author?: string | null
  publishedAt?: string
  source?: { name?: string }
}

const FIRST_POLL_BACKFILL_MS = 7 * 24 * 3600 * 1000

export const newsFetcher: SourceFetcher = {
  id: 'news',
  minIntervalMinutes: 60,

  async fetch(term, cursor, ctx) {
    const since = cursor ? new Date(cursor).getTime() : Date.now() - FIRST_POLL_BACKFILL_MS

    const reply = (await ctx.integrations.call('newsapi/search-everything', {
      q: `"${term}"`,
      from: new Date(since + 1000).toISOString(),
      sortBy: 'publishedAt',
      pageSize: 25,
    })) as { articles?: NewsArticle[] }

    let maxSeen = since
    const items: NewMention[] = []
    for (const article of reply.articles ?? []) {
      if (!article.url) continue
      const published = article.publishedAt ? new Date(article.publishedAt).getTime() : 0
      if (published <= since) continue
      if (published > maxSeen) maxSeen = published
      items.push({
        source: 'news',
        // News has no native id — the canonical URL is the dedupe key.
        source_id: article.url,
        author: article.author || article.source?.name || '',
        author_url: '',
        url: article.url,
        title: article.title ?? '',
        body: article.description || article.content || '',
        published_at: article.publishedAt ?? '',
        engagement: {},
      })
    }

    return { items, nextCursor: new Date(maxSeen).toISOString() }
  },
}
