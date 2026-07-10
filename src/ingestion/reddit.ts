/**
 * Reddit fetcher — public search JSON endpoint (no OAuth). Best-effort:
 * cloud IPs are sometimes rate-limited; failures are logged and retried
 * on the next poll. Cursor = newest created_utc seen (unix seconds).
 */

import type { SourceFetcher, NewMention } from './types'

interface RedditChild {
  data: {
    id: string
    title?: string
    selftext?: string
    author?: string
    permalink?: string
    url?: string
    created_utc?: number
    score?: number
    num_comments?: number
    subreddit?: string
  }
}

const FIRST_POLL_BACKFILL_SECONDS = 7 * 24 * 3600

export const redditFetcher: SourceFetcher = {
  id: 'reddit',

  async fetch(term, cursor) {
    const since = cursor
      ? Number(cursor)
      : Math.floor(Date.now() / 1000) - FIRST_POLL_BACKFILL_SECONDS

    const url = new URL('https://www.reddit.com/search.json')
    url.searchParams.set('q', `"${term}"`)
    url.searchParams.set('sort', 'new')
    url.searchParams.set('limit', '50')
    url.searchParams.set('raw_json', '1')

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'listenpost/1.0 (keyword monitoring; contact via app.space)' },
    })
    if (!res.ok) throw new Error(`Reddit search responded ${res.status}`)
    const json = (await res.json()) as { data?: { children?: RedditChild[] } }
    const children = json.data?.children ?? []

    let maxSeen = since
    const items: NewMention[] = []
    for (const child of children) {
      const d = child.data
      const created = d.created_utc ?? 0
      if (created <= since) continue
      if (created > maxSeen) maxSeen = created
      items.push({
        source: 'reddit',
        source_id: d.id,
        author: d.author ?? '',
        author_url: d.author ? `https://www.reddit.com/user/${d.author}` : '',
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : (d.url ?? ''),
        title: d.title ?? '',
        body: d.selftext || d.title || '',
        published_at: new Date(created * 1000).toISOString(),
        engagement: {
          ...(d.score != null ? { points: d.score } : {}),
          ...(d.num_comments != null ? { comments: d.num_comments } : {}),
        },
      })
    }

    return { items, nextCursor: String(maxSeen) }
  },
}
