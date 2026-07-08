/**
 * Mentions — live feed (raw list for now; the full triage cockpit with
 * filters, presence, and assignment lands in Phase 4).
 */

import { useQuery } from 'deepspace'
import { Badge, EmptyState } from '@/components/ui'
import type { Mention, Relevance, Sentiment } from '../../types'

const SENTIMENT_BADGE: Record<Sentiment, 'success' | 'destructive' | 'secondary' | 'outline'> = {
  positive: 'success',
  negative: 'destructive',
  neutral: 'secondary',
  pending: 'outline',
}

const RELEVANCE_BADGE: Record<Relevance, 'default' | 'secondary' | 'outline'> = {
  high: 'default',
  medium: 'secondary',
  low: 'outline',
  pending: 'outline',
}

export default function MentionsPage() {
  const { records, status } = useQuery<Mention>('mentions', {
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 100,
  })

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Mentions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every mention of your keywords, streaming in live.
          </p>
        </div>

        {status === 'loading' && (
          <div className="py-16 text-center text-muted-foreground">Loading…</div>
        )}

        {status !== 'loading' && (records ?? []).length === 0 && (
          <EmptyState
            title="No mentions yet"
            description="Add a keyword and the crawler will start pulling mentions within a few minutes."
          />
        )}

        <ul className="space-y-3" data-testid="mention-list">
          {(records ?? []).map((r) => {
            const m = r.data
            return (
              <li
                key={r.recordId}
                data-testid="mention-row"
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{m.source}</Badge>
                  <Badge variant={RELEVANCE_BADGE[m.relevance ?? 'pending']}>
                    {m.relevance === 'pending' ? 'scoring…' : `relevance: ${m.relevance}`}
                  </Badge>
                  <Badge variant={SENTIMENT_BADGE[m.sentiment ?? 'pending']}>
                    {m.sentiment === 'pending' ? 'sentiment…' : m.sentiment}
                  </Badge>
                  {(m.tags ?? []).map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block font-semibold hover:text-primary"
                >
                  {m.title || m.body?.slice(0, 120) || m.url}
                </a>
                {m.body && (
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{m.body}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {m.author && <span>{m.author} · </span>}
                  {m.published_at && new Date(m.published_at).toLocaleString()}
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
