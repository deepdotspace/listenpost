/**
 * Mentions — the real-time triage cockpit (the hero surface).
 *
 * Live feed via useQuery subscriptions; filters; multi-user triage
 * (status / assign / notes) that syncs instantly to every teammate;
 * presence bar showing who else is in the feed via PresenceRoom.
 */

import { useMemo, useState } from 'react'
import { useQuery, useMutations, useUser, useUserLookup, usePresenceRoom, getUserColor } from 'deepspace'
import { Badge, Button, EmptyState, useToast } from '@/components/ui'
import type { Keyword, Mention, MentionStatus, Relevance, Sentiment } from '../../types'

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

const STATUSES: { id: MentionStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'ignored', label: 'Ignored' },
]

const SENTIMENT_FILTERS: Sentiment[] = ['positive', 'negative', 'neutral']
const RELEVANCE_FILTERS: Relevance[] = ['high', 'medium', 'low']

interface Filters {
  source: string | null
  sentiment: Sentiment | null
  relevance: Relevance | null
  status: MentionStatus | null
  keywordId: string | null
}

const NO_FILTERS: Filters = { source: null, sentiment: null, relevance: null, status: null, keywordId: null }

export default function MentionsPage() {
  const { records, status } = useQuery<Mention>('mentions', {
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 200,
  })
  const { records: keywords } = useQuery<Keyword>('keywords', { limit: 100 })
  const { put } = useMutations<Mention>('mentions')
  const { user } = useUser()
  const { getName } = useUserLookup()
  const { peers, connected } = usePresenceRoom('feed:mentions')
  const { error } = useToast()

  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const canTriage = user?.role === 'member' || user?.role === 'admin'

  const sources = useMemo(
    () => [...new Set((records ?? []).map((r) => r.data.source))].sort(),
    [records],
  )

  const filtered = useMemo(() => {
    return (records ?? []).filter((r) => {
      const m = r.data
      if (filters.source && m.source !== filters.source) return false
      if (filters.sentiment && m.sentiment !== filters.sentiment) return false
      if (filters.relevance && m.relevance !== filters.relevance) return false
      if (filters.status && (m.status ?? 'new') !== filters.status) return false
      if (filters.keywordId && m.keyword_id !== filters.keywordId) return false
      return true
    })
  }, [records, filters])

  async function triage(recordId: string, patch: Partial<Mention>) {
    try {
      await put(recordId, patch)
    } catch (err) {
      error('Update failed', String(err))
    }
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mentions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} of {(records ?? []).length} mentions · live
            </p>
          </div>
          <PresenceBar peers={peers} connected={connected} />
        </div>

        <FilterBar
          sources={sources}
          keywords={keywords ?? []}
          filters={filters}
          onChange={setFilters}
        />

        {status === 'loading' && (
          <div className="py-16 text-center text-muted-foreground">Loading…</div>
        )}

        {status !== 'loading' && filtered.length === 0 && (
          <EmptyState
            title={(records ?? []).length === 0 ? 'No mentions yet' : 'Nothing matches these filters'}
            description={
              (records ?? []).length === 0
                ? 'Add a keyword and the crawler will start pulling mentions within a few minutes.'
                : 'Try clearing a filter or two.'
            }
          />
        )}

        <ul className="mt-4 space-y-3" data-testid="mention-list">
          {filtered.map((r) => (
            <MentionCard
              key={r.recordId}
              recordId={r.recordId}
              mention={r.data}
              canTriage={canTriage}
              assigneeName={r.data.assigned_to ? (getName(r.data.assigned_to) ?? 'someone') : null}
              onTriage={triage}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

// ─── Presence ────────────────────────────────────────────────────────────────

function PresenceBar({
  peers,
  connected,
}: {
  peers: Array<{ userId: string; userName?: string }>
  connected: boolean
}) {
  return (
    <div className="flex items-center gap-2" data-testid="presence-bar">
      {peers.length > 0 && (
        <div className="flex -space-x-2">
          {peers.slice(0, 5).map((p) => (
            <span
              key={p.userId}
              data-testid="presence-peer"
              title={p.userName ?? 'teammate'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-background text-xs font-semibold text-white"
              style={{ backgroundColor: getUserColor(p.userId) }}
            >
              {(p.userName ?? '?').slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
      )}
      <span className="text-xs text-muted-foreground">
        {connected
          ? peers.length === 0
            ? 'just you'
            : `${peers.length} teammate${peers.length > 1 ? 's' : ''} here`
          : 'connecting…'}
      </span>
    </div>
  )
}

// ─── Filters ─────────────────────────────────────────────────────────────────

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}

function FilterBar({
  sources,
  keywords,
  filters,
  onChange,
}: {
  sources: string[]
  keywords: Array<{ recordId: string; data: Keyword }>
  filters: Filters
  onChange: (f: Filters) => void
}) {
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: filters[key] === value ? null : value })

  const hasAny = Object.values(filters).some((v) => v !== null)

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3" data-testid="filter-bar">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-xs text-muted-foreground">Status</span>
        {STATUSES.map((s) => (
          <FilterChip key={s.id} active={filters.status === s.id} label={s.label} onClick={() => toggle('status', s.id)} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-xs text-muted-foreground">Relevance</span>
        {RELEVANCE_FILTERS.map((v) => (
          <FilterChip key={v} active={filters.relevance === v} label={v} onClick={() => toggle('relevance', v)} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-xs text-muted-foreground">Sentiment</span>
        {SENTIMENT_FILTERS.map((v) => (
          <FilterChip key={v} active={filters.sentiment === v} label={v} onClick={() => toggle('sentiment', v)} />
        ))}
      </div>
      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 text-xs text-muted-foreground">Source</span>
          {sources.map((s) => (
            <FilterChip key={s} active={filters.source === s} label={s} onClick={() => toggle('source', s)} />
          ))}
        </div>
      )}
      {keywords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 text-xs text-muted-foreground">Keyword</span>
          {keywords.map((k) => (
            <FilterChip
              key={k.recordId}
              active={filters.keywordId === k.recordId}
              label={k.data.term}
              onClick={() => toggle('keywordId', k.recordId)}
            />
          ))}
        </div>
      )}
      {hasAny && (
        <button
          type="button"
          onClick={() => onChange(NO_FILTERS)}
          className="text-xs text-primary hover:underline"
        >
          Clear all filters
        </button>
      )}
    </div>
  )
}

// ─── Mention card ────────────────────────────────────────────────────────────

function MentionCard({
  recordId,
  mention: m,
  canTriage,
  assigneeName,
  onTriage,
}: {
  recordId: string
  mention: Mention
  canTriage: boolean
  assigneeName: string | null
  onTriage: (recordId: string, patch: Partial<Mention>) => Promise<void>
}) {
  const [showAssign, setShowAssign] = useState(false)
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const currentStatus = m.status ?? 'new'

  return (
    <li
      data-testid="mention-row"
      data-status={currentStatus}
      data-source-id={m.source_id}
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
        {currentStatus !== 'new' && (
          <Badge variant={currentStatus === 'resolved' ? 'success' : 'outline'} data-testid="status-badge">
            {currentStatus}
          </Badge>
        )}
        {assigneeName && (
          <span className="text-xs text-muted-foreground">→ {assigneeName}</span>
        )}
      </div>

      <a href={m.url} target="_blank" rel="noreferrer" className="mt-2 block font-semibold hover:text-primary">
        {m.title || m.body?.slice(0, 120) || m.url}
      </a>
      {m.body && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{m.body}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {m.author && <span>{m.author} · </span>}
        {m.published_at && new Date(m.published_at).toLocaleString()}
        {m.engagement?.points != null && <span> · {m.engagement.points} points</span>}
        {m.engagement?.comments != null && <span> · {m.engagement.comments} comments</span>}
      </p>

      {canTriage && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {STATUSES.map((s) => (
            <Button
              key={s.id}
              type="button"
              size="sm"
              variant={currentStatus === s.id ? 'default' : 'ghost'}
              data-testid={`set-status-${s.id}`}
              onClick={() => currentStatus !== s.id && onTriage(recordId, { status: s.id })}
            >
              {s.label}
            </Button>
          ))}
          <AssignControl
            open={showAssign}
            setOpen={setShowAssign}
            onAssign={(userId) => {
              setShowAssign(false)
              // Empty string (not undefined) so the merge actually clears it.
              void onTriage(recordId, {
                assigned_to: userId ?? '',
                status: userId ? 'assigned' : currentStatus,
              })
            }}
          />
          <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2">
            <input
              value={notesDraft ?? m.notes ?? ''}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft !== null && notesDraft !== (m.notes ?? '')) {
                  void onTriage(recordId, { notes: notesDraft })
                }
                setNotesDraft(null)
              }}
              placeholder="Add a note…"
              data-testid="mention-notes"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}
    </li>
  )
}

function AssignControl({
  open,
  setOpen,
  onAssign,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  onAssign: (userId: string | undefined) => void
}) {
  const { users } = useUserLookup()

  return (
    <div className="relative">
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(!open)}>
        Assign
      </Button>
      {open && (
        <div className="absolute z-10 mt-1 w-48 rounded-md border border-border bg-card p-1 shadow-card">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onAssign(u.id)}
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-secondary"
            >
              {u.name || u.email}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onAssign(undefined)}
            className="block w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-secondary"
          >
            Unassign
          </button>
        </div>
      )}
    </div>
  )
}
