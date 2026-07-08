/**
 * YouTube fetcher — `youtube/search-videos` integration (owner-billed,
 * $0.01/call), so it polls hourly, not every cron tick.
 * Cursor = newest publishedAt ISO timestamp seen.
 */

import type { SourceFetcher, NewMention } from './types'

interface YtItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    description?: string
    channelTitle?: string
    channelId?: string
    publishedAt?: string
  }
}

const FIRST_POLL_BACKFILL_MS = 7 * 24 * 3600 * 1000

export const youtubeFetcher: SourceFetcher = {
  id: 'youtube',
  minIntervalMinutes: 60,

  async fetch(term, cursor, ctx) {
    const since = cursor ? new Date(cursor).getTime() : Date.now() - FIRST_POLL_BACKFILL_MS

    const reply = (await ctx.integrations.call('youtube/search-videos', {
      q: term,
      order: 'date',
      maxResults: 25,
      publishedAfter: new Date(since + 1000).toISOString(),
    })) as { items?: YtItem[] }

    let maxSeen = since
    const items: NewMention[] = []
    for (const item of reply.items ?? []) {
      const videoId = item.id?.videoId
      const s = item.snippet
      if (!videoId || !s) continue
      const published = s.publishedAt ? new Date(s.publishedAt).getTime() : 0
      if (published > maxSeen) maxSeen = published
      items.push({
        source: 'youtube',
        source_id: videoId,
        author: s.channelTitle ?? '',
        author_url: s.channelId ? `https://www.youtube.com/channel/${s.channelId}` : '',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: s.title ?? '',
        body: s.description ?? '',
        published_at: s.publishedAt ?? '',
        engagement: {},
      })
    }

    return { items, nextCursor: new Date(maxSeen).toISOString() }
  },
}
