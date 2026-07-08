/**
 * GitHub fetcher — `github/search-repositories` integration (owner-billed).
 * The proxy only exposes repository search, so this surfaces new repos
 * matching the keyword (best-effort; no issue/discussion firehose).
 * Cursor = newest repo created_at ISO timestamp seen.
 */

import type { SourceFetcher, NewMention } from './types'

interface GhRepo {
  id?: number
  full_name?: string
  html_url?: string
  description?: string | null
  created_at?: string
  stargazers_count?: number
  owner?: { login?: string; html_url?: string }
}

const FIRST_POLL_BACKFILL_MS = 30 * 24 * 3600 * 1000

export const githubFetcher: SourceFetcher = {
  id: 'github',
  minIntervalMinutes: 60,

  async fetch(term, cursor, ctx) {
    const since = cursor ? new Date(cursor).getTime() : Date.now() - FIRST_POLL_BACKFILL_MS
    const sinceDate = new Date(since).toISOString().slice(0, 10)

    const reply = (await ctx.integrations.call('github/search-repositories', {
      q: `"${term}" in:name,description,readme created:>${sinceDate}`,
      sort: 'updated',
      order: 'desc',
      per_page: 25,
    })) as { items?: GhRepo[] }

    let maxSeen = since
    const items: NewMention[] = []
    for (const repo of reply.items ?? []) {
      if (!repo.id || !repo.full_name) continue
      const created = repo.created_at ? new Date(repo.created_at).getTime() : 0
      if (created <= since) continue
      if (created > maxSeen) maxSeen = created
      items.push({
        source: 'github',
        source_id: String(repo.id),
        author: repo.owner?.login ?? '',
        author_url: repo.owner?.html_url ?? '',
        url: repo.html_url ?? '',
        title: repo.full_name,
        body: repo.description ?? '',
        published_at: repo.created_at ?? '',
        engagement: {
          ...(repo.stargazers_count != null ? { stars: repo.stargazers_count } : {}),
        },
      })
    }

    return { items, nextCursor: new Date(maxSeen).toISOString() }
  },
}
