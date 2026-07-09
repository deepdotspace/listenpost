/**
 * Mentions — the real-time triage cockpit (the hero surface).
 *
 * Live feed via useQuery subscriptions; dropdown filter toolbar; compact
 * per-row triage (status menu, assign menu, ghost note line) that syncs
 * instantly to every teammate; presence avatars in the page header.
 */

import { useMemo, useState } from 'react'
import {
  useQuery,
  useMutations,
  useUser,
  useUserLookup,
  usePresenceRoom,
  getUserColor,
} from 'deepspace'
import { ArrowUpRight, CircleDot, ListFilter, MessageSquare, UserPlus } from 'lucide-react'
import { Badge, DropdownMenu, EmptyState, SkeletonList, useToast, cn } from '@/components/ui'
import { PageHeader } from '../../components/PageHeader'
import type { Keyword, Mention, MentionStatus, Relevance, Sentiment } from '../../types'

const STATUSES: { id: MentionStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'ignored', label: 'Ignored' },
]

const SENTIMENT_FILTERS: Sentiment[] = ['positive', 'negative', 'neutral']
const RELEVANCE_FILTERS: Relevance[] = ['high', 'medium', 'low']

/** Sentiment → dot color. Neutral stays quiet. */
const SENTIMENT_DOT: Record<string, string> = {
  positive: 'bg-success',
  negative: 'bg-destructive',
  neutral: 'bg-muted-foreground/50',
  pending: 'bg-muted-foreground/30',
}

const RELEVANCE_STYLE: Record<string, string> = {
  high: 'text-primary border-primary/40 bg-primary/10',
  medium: 'text-foreground/80 border-border bg-secondary',
  low: 'text-muted-foreground border-border',
  pending: 'text-muted-foreground border-border animate-pulse',
}

interface Filters {
  source: string | null
  sentiment: Sentiment | null
  relevance: Relevance | null
  status: MentionStatus | null
  keywordId: string | null
}

const NO_FILTERS: Filters = {
  source: null,
  sentiment: null,
  relevance: null,
  status: null,
  keywordId: null,
}

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

  const loading = status === 'loading'
  const total = (records ?? []).length

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Mentions"
        meta={
          <span className="flex items-center gap-1.5">
            {connected && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
            )}
            {filtered.length === total ? `${total} mentions` : `${filtered.length} of ${total}`}
          </span>
        }
        actions={<PresenceBar peers={peers} connected={connected} />}
      />

      <FilterToolbar
        sources={sources}
        keywords={keywords ?? []}
        filters={filters}
        onChange={setFilters}
      />

      <div className="flex-1 px-4 py-4 sm:px-6">
        {(keywords ?? []).length === 0 && !loading && (
          <div
            data-testid="onboarding-banner"
            className="mb-4 rounded-lg border border-primary/30 bg-primary/[0.06] p-4"
          >
            <p className="text-sm font-semibold text-foreground">Start monitoring in two steps</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
              <li>
                Add a <span className="text-foreground">keyword</span> — your brand, a feature, a
                competitor, or a pain point.
              </li>
              <li>
                Give it <span className="text-foreground">brand context</span> so the AI knows what
                counts as relevant for you. Mentions stream in within ~5 minutes.
              </li>
            </ol>
            <a
              href="/keywords"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
            >
              Add your first keyword
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        )}

        {loading && <SkeletonList rows={6} />}

        {!loading && filtered.length === 0 && (
          <div className="rounded-lg border border-border">
            <EmptyState
              title={total === 0 ? 'No mentions yet' : 'Nothing matches these filters'}
              description={
                total === 0
                  ? 'Add a keyword and the crawler will start pulling mentions within a few minutes.'
                  : 'Try clearing a filter or two.'
              }
              {...(total > 0
                ? { action: { label: 'Clear filters', onClick: () => setFilters(NO_FILTERS) } }
                : {})}
            />
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul
            className="divide-y divide-border overflow-visible rounded-lg border border-border bg-card/50"
            data-testid="mention-list"
          >
            {filtered.map((r) => (
              <MentionRow
                key={r.recordId}
                recordId={r.recordId}
                mention={r.data}
                canTriage={canTriage}
                assigneeName={r.data.assigned_to ? (getName(r.data.assigned_to) ?? 'someone') : null}
                onTriage={triage}
              />
            ))}
          </ul>
        )}
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
      {peers.length > 0 ? (
        <>
          <div className="flex -space-x-1.5">
            {peers.slice(0, 5).map((p) => (
              <span
                key={p.userId}
                data-testid="presence-peer"
                title={p.userName ?? 'teammate'}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold text-white"
                style={{ backgroundColor: getUserColor(p.userId) }}
              >
                {(p.userName ?? '?').slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {peers.length} here
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground/70">
          {connected ? 'just you' : 'connecting…'}
        </span>
      )}
    </div>
  )
}

// ─── Filter toolbar ──────────────────────────────────────────────────────────

function FilterToolbar({
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
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: filters[key] === value ? null : value })

  const activeCount = Object.values(filters).filter((v) => v !== null).length
  const keywordTerm = filters.keywordId
    ? (keywords.find((k) => k.recordId === filters.keywordId)?.data.term ?? 'keyword')
    : null

  return (
    <div
      data-testid="filter-bar"
      className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2 sm:px-6"
    >
      <ListFilter className="mr-0.5 h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />

      <DropdownMenu>
        <DropdownMenu.Trigger active={filters.status !== null}>
          {filters.status ? STATUSES.find((s) => s.id === filters.status)?.label : 'Status'}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {STATUSES.map((s) => (
            <DropdownMenu.Item
              key={s.id}
              selected={filters.status === s.id}
              onClick={() => set('status', s.id)}
            >
              {s.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenu.Trigger active={filters.relevance !== null}>
          {filters.relevance ? `Relevance: ${filters.relevance}` : 'Relevance'}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {RELEVANCE_FILTERS.map((v) => (
            <DropdownMenu.Item
              key={v}
              selected={filters.relevance === v}
              onClick={() => set('relevance', v)}
            >
              {v}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenu.Trigger active={filters.sentiment !== null}>
          {filters.sentiment ?? 'Sentiment'}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {SENTIMENT_FILTERS.map((v) => (
            <DropdownMenu.Item
              key={v}
              selected={filters.sentiment === v}
              onClick={() => set('sentiment', v)}
            >
              {v}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>

      {sources.length > 0 && (
        <DropdownMenu>
          <DropdownMenu.Trigger active={filters.source !== null}>
            {filters.source ?? 'Source'}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            {sources.map((s) => (
              <DropdownMenu.Item
                key={s}
                selected={filters.source === s}
                onClick={() => set('source', s)}
              >
                {s}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu>
      )}

      {keywords.length > 0 && (
        <DropdownMenu>
          <DropdownMenu.Trigger active={filters.keywordId !== null}>
            {keywordTerm ?? 'Keyword'}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            {keywords.map((k) => (
              <DropdownMenu.Item
                key={k.recordId}
                selected={filters.keywordId === k.recordId}
                onClick={() => set('keywordId', k.recordId)}
              >
                {k.data.term}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange(NO_FILTERS)}
          className="ml-1 text-xs font-medium text-primary hover:underline"
        >
          Clear ({activeCount})
        </button>
      )}
    </div>
  )
}

// ─── Mention row ─────────────────────────────────────────────────────────────

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

function MentionRow({
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
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const { users } = useUserLookup()
  const currentStatus = m.status ?? 'new'
  const relevance = m.relevance ?? 'pending'
  const sentiment = m.sentiment ?? 'pending'
  const showNotes = notesOpen || !!m.notes

  return (
    <li
      data-testid="mention-row"
      data-status={currentStatus}
      data-source-id={m.source_id}
      data-relevance={relevance}
      className={cn(
        'group px-4 py-3 transition-colors hover:bg-secondary/40 sm:px-5',
        (currentStatus === 'resolved' || currentStatus === 'ignored') && 'opacity-55',
      )}
    >
      {/* Line 1 — source · title · verdicts */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-[11px] text-muted-foreground">{m.source}</span>
            <a
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 text-[13.5px] font-medium leading-snug text-foreground hover:text-primary"
            >
              {m.title || m.body?.slice(0, 120) || m.url}
            </a>
          </div>
          {m.body && m.body !== m.title && (
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
              {m.body}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground/80">
            {m.author && <span>{m.author}</span>}
            {m.published_at && <span>{timeAgo(m.published_at)}</span>}
            {m.engagement?.points != null && <span>{m.engagement.points} pts</span>}
            {m.engagement?.comments != null && <span>{m.engagement.comments} comments</span>}
            {(m.tags ?? []).map((t) => (
              <Badge key={t} variant="secondary" size="sm" className="font-mono">
                {t}
              </Badge>
            ))}
            {currentStatus !== 'new' && (
              <Badge
                variant={currentStatus === 'resolved' ? 'success' : 'outline'}
                size="sm"
                data-testid="status-badge"
              >
                {currentStatus}
              </Badge>
            )}
            {assigneeName && <span className="text-foreground/70">→ {assigneeName}</span>}
          </div>
        </div>

        {/* Verdicts + triage cluster */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            title={
              relevance === 'pending' ? 'AI scoring in progress' : `AI relevance: ${relevance}`
            }
            className={cn(
              'inline-flex h-[22px] items-center rounded-md border px-1.5 font-mono text-[11px]',
              RELEVANCE_STYLE[relevance],
            )}
          >
            {relevance === 'pending' ? 'scoring' : relevance}
          </span>
          <span
            title={sentiment === 'pending' ? 'sentiment pending' : `sentiment: ${sentiment}`}
            className="inline-flex h-[22px] items-center gap-1 rounded-md border border-border px-1.5 font-mono text-[11px] text-muted-foreground"
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', SENTIMENT_DOT[sentiment])} />
            <span className="hidden md:inline">{sentiment === 'pending' ? '…' : sentiment}</span>
          </span>

          {canTriage && (
            <>
              <DropdownMenu>
                <DropdownMenu.Trigger
                  chevron={false}
                  data-testid="status-menu-trigger"
                  className="h-[22px] px-1.5"
                  title="Set status"
                >
                  <CircleDot className="h-3.5 w-3.5" aria-hidden />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Label>Status</DropdownMenu.Label>
                  {STATUSES.map((s) => (
                    <DropdownMenu.Item
                      key={s.id}
                      data-testid={`set-status-${s.id}`}
                      selected={currentStatus === s.id}
                      onClick={() => currentStatus !== s.id && onTriage(recordId, { status: s.id })}
                    >
                      {s.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenu.Trigger
                  chevron={false}
                  data-testid="assign-menu-trigger"
                  className="h-[22px] px-1.5"
                  title="Assign"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Label>Assign to</DropdownMenu.Label>
                  {users.map((u) => (
                    <DropdownMenu.Item
                      key={u.id}
                      selected={m.assigned_to === u.id}
                      onClick={() =>
                        onTriage(recordId, {
                          assigned_to: u.id,
                          status: 'assigned',
                        })
                      }
                    >
                      {u.name || u.email}
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    onClick={() =>
                      // Empty string (not undefined) so the merge actually clears it.
                      onTriage(recordId, { assigned_to: '', status: currentStatus })
                    }
                  >
                    Unassign
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>

              <button
                type="button"
                title="Note"
                data-testid="note-toggle"
                onClick={() => setNotesOpen((v) => !v)}
                className={cn(
                  'inline-flex h-[22px] items-center rounded-md border border-border px-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                  showNotes && 'border-primary/40 bg-primary/10 text-primary',
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Note line — ghost input, visible when open or when a note exists */}
      {canTriage && (
        <div className={cn('mt-2', !showNotes && 'hidden')}>
          <input
            value={notesDraft ?? m.notes ?? ''}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => {
              if (notesDraft !== null && notesDraft !== (m.notes ?? '')) {
                void onTriage(recordId, { notes: notesDraft })
              }
              setNotesDraft(null)
            }}
            placeholder="Add a note for the team…"
            data-testid="mention-notes"
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border focus:border-border focus:bg-background"
          />
        </div>
      )}
    </li>
  )
}
