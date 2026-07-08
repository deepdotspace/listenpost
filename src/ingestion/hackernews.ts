/**
 * Hacker News fetcher — Algolia HN Search API. Free, no auth.
 * https://hn.algolia.com/api/v1/search_by_date
 *
 * Cursor = the max `created_at_i` (unix seconds) seen, stored as a string.
 */

import type { SourceFetcher, NewMention } from './types'

interface HnHit {
  objectID: string
  title?: string | null
  story_title?: string | null
  comment_text?: string | null
  story_text?: string | null
  url?: string | null
  author?: string
  created_at?: string
  created_at_i?: number
  points?: number | null
  num_comments?: number | null
}

/** Strip HN's HTML fragments down to readable text. */
function stripHtml(html: string): string {
  return html
    .replace(/<p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .trim()
}

const FIRST_POLL_BACKFILL_SECONDS = 7 * 24 * 3600
const PAGE_SIZE = 50

export const hackernewsFetcher: SourceFetcher = {
  id: 'hackernews',

  async fetch(term, cursor) {
    const since = cursor
      ? Number(cursor)
      : Math.floor(Date.now() / 1000) - FIRST_POLL_BACKFILL_SECONDS

    const url = new URL('https://hn.algolia.com/api/v1/search_by_date')
    url.searchParams.set('query', `"${term}"`)
    url.searchParams.set('tags', '(story,comment)')
    url.searchParams.set('hitsPerPage', String(PAGE_SIZE))
    url.searchParams.set('numericFilters', `created_at_i>${since}`)

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`HN Algolia responded ${res.status}`)
    const json = (await res.json()) as { hits?: HnHit[] }
    const hits = json.hits ?? []

    let maxSeen = since
    const items: NewMention[] = hits.map((h) => {
      if (h.created_at_i && h.created_at_i > maxSeen) maxSeen = h.created_at_i
      const isComment = !!h.comment_text
      const body = h.comment_text
        ? stripHtml(h.comment_text)
        : h.story_text
          ? stripHtml(h.story_text)
          : (h.title ?? '')
      return {
        source: 'hackernews',
        source_id: h.objectID,
        author: h.author ?? '',
        author_url: h.author ? `https://news.ycombinator.com/user?id=${h.author}` : '',
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: (isComment ? h.story_title : h.title) ?? '',
        body,
        published_at: h.created_at ?? new Date((h.created_at_i ?? 0) * 1000).toISOString(),
        engagement: {
          ...(h.points != null ? { points: h.points } : {}),
          ...(h.num_comments != null ? { comments: h.num_comments } : {}),
        },
      }
    })

    return { items, nextCursor: String(maxSeen) }
  },
}
