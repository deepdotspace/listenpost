/**
 * Bluesky fetcher — public AT Protocol search endpoint, no auth.
 * Cursor = newest post createdAt ISO timestamp seen.
 */

import type { SourceFetcher, NewMention } from './types'

interface BskyPost {
  uri: string
  cid: string
  author?: { handle?: string; displayName?: string }
  record?: { text?: string; createdAt?: string }
  likeCount?: number
  replyCount?: number
  repostCount?: number
}

const FIRST_POLL_BACKFILL_MS = 7 * 24 * 3600 * 1000

/** at://did:plc:xyz/app.bsky.feed.post/3kabc → https://bsky.app/profile/<handle>/post/3kabc */
function postUrl(post: BskyPost): string {
  const rkey = post.uri.split('/').pop() ?? ''
  const handle = post.author?.handle ?? ''
  return handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : ''
}

export const blueskyFetcher: SourceFetcher = {
  id: 'bluesky',

  async fetch(term, cursor) {
    const since = cursor ? new Date(cursor).getTime() : Date.now() - FIRST_POLL_BACKFILL_MS

    // api.bsky.app (AppView) rather than public.api.bsky.app — same public
    // surface, but reachable from more networks.
    const url = new URL('https://api.bsky.app/xrpc/app.bsky.feed.searchPosts')
    url.searchParams.set('q', `"${term}"`)
    url.searchParams.set('sort', 'latest')
    url.searchParams.set('limit', '50')

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Bluesky search responded ${res.status}`)
    const json = (await res.json()) as { posts?: BskyPost[] }
    const posts = json.posts ?? []

    let maxSeen = since
    const items: NewMention[] = []
    for (const post of posts) {
      const createdAt = post.record?.createdAt
      const created = createdAt ? new Date(createdAt).getTime() : 0
      if (created <= since) continue
      if (created > maxSeen) maxSeen = created
      items.push({
        source: 'bluesky',
        source_id: post.cid,
        author: post.author?.displayName || post.author?.handle || '',
        author_url: post.author?.handle ? `https://bsky.app/profile/${post.author.handle}` : '',
        url: postUrl(post),
        title: '',
        body: post.record?.text ?? '',
        published_at: createdAt ?? '',
        engagement: {
          ...(post.likeCount != null ? { likes: post.likeCount } : {}),
          ...(post.replyCount != null ? { comments: post.replyCount } : {}),
          ...(post.repostCount != null ? { reposts: post.repostCount } : {}),
        },
      })
    }

    return { items, nextCursor: new Date(maxSeen).toISOString() }
  },
}
