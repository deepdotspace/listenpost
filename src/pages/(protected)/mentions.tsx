/**
 * Mentions — the real-time triage cockpit (the hero surface).
 *
 * Light-theme redesign with three view modes (Table / Feed / Board) driven by a
 * local LAYOUT segmented control. Live feed via useQuery subscriptions; status
 * chips + dropdown filter toolbar; compact per-row triage (status menu, assign
 * menu, ghost note line) that syncs instantly to every teammate; presence
 * avatars + search in the page header.
 *
 * Data layer (useQuery / useMutations / usePresence) is unchanged — this file is
 * presentation only.
 */

import { useMemo, useState, type CSSProperties } from 'react'
import {
  useQuery,
  useMutations,
  useUser,
  useUserLookup,
  usePresenceRoom,
  getUserColor,
} from 'deepspace'
import {
  ArrowUpRight,
  CircleDot,
  Columns3,
  MessageSquare,
  Rows3,
  Search,
  Table as TableIcon,
  UserPlus,
} from 'lucide-react'
import { DropdownMenu, EmptyState, SkeletonList, useToast, cn } from '@/components/ui'
import { PageHeader } from '../../components/PageHeader'
import { useWorkspace } from '../../components/WorkspaceProvider'
import type { Keyword, Mention, MentionStatus, Relevance, Sentiment } from '../../types'

type Layout = 'table' | 'feed' | 'board'

const STATUSES: { id: MentionStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'ignored', label: 'Ignored' },
]

const SENTIMENT_FILTERS: Sentiment[] = ['positive', 'negative', 'neutral']
const RELEVANCE_FILTERS: Relevance[] = ['high', 'medium', 'low']

const LAYOUTS: { id: Layout; label: string; icon: typeof TableIcon }[] = [
  { id: 'table', label: 'Table', icon: TableIcon },
  { id: 'feed', label: 'Feed', icon: Rows3 },
  { id: 'board', label: 'Board', icon: Columns3 },
]

/** Grid track shared by the table header row and every table body row. */
const TABLE_GRID =
  'grid grid-cols-[76px_108px_minmax(300px,2fr)_116px_92px_108px_84px] items-center gap-3'

// ─── Signal color system (calm: rule + dot, not loud chips) ──────────────────

const SOURCE_META: Record<string, { color: string; abbr: string }> = {
  hackernews: { color: '#e8863c', abbr: 'HN' },
  reddit: { color: '#e0645c', abbr: 'RE' },
  youtube: { color: '#d64b4b', abbr: 'YT' },
  github: { color: '#57606a', abbr: 'GH' },
  news: { color: '#7a8290', abbr: 'NW' },
  podcast: { color: '#8b5cf6', abbr: 'PC' },
  web: { color: '#6b7280', abbr: 'WB' },
  bluesky: { color: '#4b8dd6', abbr: 'BS' },
  stackoverflow: { color: '#ef8e3b', abbr: 'SO' },
  devto: { color: '#3b3f47', abbr: 'DV' },
  producthunt: { color: '#da552f', abbr: 'PH' },
  x: { color: '#3a3f47', abbr: 'X' },
  linkedin: { color: '#2563eb', abbr: 'LI' },
}

function sourceMeta(source: string) {
  return SOURCE_META[source] ?? { color: '#7a8290', abbr: source.slice(0, 2).toUpperCase() }
}

/** Relevance / priority color (high = accent). */
const REL_COLOR: Record<string, string> = {
  high: '#4f46e5',
  medium: '#8a6d1f',
  low: '#9aa1ab',
  pending: '#c3c8d0',
}

/** Sentiment dot color. Neutral stays quiet. */
const SENT_COLOR: Record<string, string> = {
  positive: '#10b981',
  negative: '#f43f5e',
  neutral: '#a3aab4',
  pending: '#c3c8d0',
}

/** Status pill fills — matched to the handoff spec. */
const STATUS_PILL: Record<MentionStatus, { bg: string; color: string }> = {
  new: { bg: 'rgba(79,70,229,0.08)', color: '#4f46e5' },
  assigned: { bg: '#eef1f4', color: '#5a616b' },
  resolved: { bg: '#e7f6ef', color: '#0f9d6b' },
  ignored: { bg: '#f3f4f6', color: '#9aa1ab' },
}

/** Board column meta. */
const BOARD_COLS: { id: MentionStatus; label: string; dot: string }[] = [
  { id: 'new', label: 'New', dot: '#4f46e5' },
  { id: 'assigned', label: 'Assigned', dot: '#6b7280' },
  { id: 'resolved', label: 'Resolved', dot: '#10b981' },
  { id: 'ignored', label: 'Ignored', dot: '#cbd0d8' },
]

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

/** Row-entrance animation — respects prefers-reduced-motion via `motion-safe`. */
const ENTER_STYLE: CSSProperties = {
  ['--tw-enter-opacity' as string]: 0,
  ['--tw-enter-translate-y' as string]: '4px',
  animationDuration: '300ms',
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
  // Presence is per-workspace — peers in another tenant shouldn't show here.
  const { currentId } = useWorkspace()
  const { peers, connected } = usePresenceRoom(`feed:${currentId}:mentions`)
  const { error } = useToast()

  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [layout, setLayout] = useState<Layout>('table')
  const [search, setSearch] = useState('')
  const canTriage = user?.role === 'member' || user?.role === 'admin'

  const sources = useMemo(
    () => [...new Set((records ?? []).map((r) => r.data.source))].sort(),
    [records],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (records ?? []).filter((r) => {
      const m = r.data
      if (filters.source && m.source !== filters.source) return false
      if (filters.sentiment && m.sentiment !== filters.sentiment) return false
      if (filters.relevance && m.relevance !== filters.relevance) return false
      if (filters.status && (m.status ?? 'new') !== filters.status) return false
      if (filters.keywordId && m.keyword_id !== filters.keywordId) return false
      if (q) {
        const hay = `${m.title ?? ''} ${m.body ?? ''} ${m.author ?? ''} ${m.source}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [records, filters, search])

  async function triage(recordId: string, patch: Partial<Mention>) {
    try {
      await put(recordId, patch)
    } catch (err) {
      error('Update failed', String(err))
    }
  }

  const loading = status === 'loading'
  const total = (records ?? []).length

  const rowProps = (r: { recordId: string; data: Mention }) => ({
    recordId: r.recordId,
    mention: r.data,
    canTriage,
    assigneeName: r.data.assigned_to ? (getName(r.data.assigned_to) ?? 'someone') : null,
    onTriage: triage,
  })

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
            <span className="tabular-nums">
              {filtered.length === total ? `${total} mentions` : `${filtered.length} of ${total}`}
            </span>
          </span>
        }
        actions={
          <>
            <PresenceBar peers={peers} connected={connected} />
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="relative hidden items-center sm:flex">
              <Search
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-tertiary"
                aria-hidden
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search mentions"
                aria-label="Search mentions"
                className="h-8 w-[200px] rounded-lg border border-input bg-background pl-8 pr-3 text-[12.5px] text-foreground outline-none transition-colors placeholder:text-tertiary focus:border-primary/40"
              />
            </div>
          </>
        }
      />

      <FilterToolbar
        sources={sources}
        keywords={keywords ?? []}
        filters={filters}
        onChange={setFilters}
        layout={layout}
        onLayoutChange={setLayout}
      />

      {(keywords ?? []).length === 0 && !loading && (
        <div className="px-5 pt-4">
          <div
            data-testid="onboarding-banner"
            className="rounded-xl border border-primary/25 bg-primary/[0.06] p-4"
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
        </div>
      )}

      {loading && (
        <div className="px-5 py-4">
          <SkeletonList rows={6} />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="px-5 py-4">
          <div className="rounded-xl border border-border">
            <EmptyState
              title={total === 0 ? 'No mentions yet' : 'Nothing matches these filters'}
              description={
                total === 0
                  ? 'Add a keyword and the crawler will start pulling mentions within a few minutes.'
                  : 'Try clearing a filter or two.'
              }
              {...(total > 0 || search
                ? {
                    action: {
                      label: 'Clear filters',
                      onClick: () => {
                        setFilters(NO_FILTERS)
                        setSearch('')
                      },
                    },
                  }
                : {})}
            />
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && layout === 'table' && (
        <div className="overflow-x-auto">
          <div className="min-w-[900px]" data-testid="mention-list">
            {/* Column header — intentionally NOT sticky: inside the
                overflow-x-auto wrapper, `position: sticky` pins against the
                wrapper (overflow-x forces overflow-y:auto on it), which
                offsets the header 52px down over the first row and swallows
                its clicks. Static header + sticky PageHeader is the fix. */}
            <div
              className={cn(
                TABLE_GRID,
                'border-b border-border bg-background px-5 py-[9px]',
                'text-[10px] font-bold uppercase tracking-[0.07em] text-tertiary',
              )}
            >
              <span>Priority</span>
              <span>Source</span>
              <span>Mention</span>
              <span>Sentiment</span>
              <span>Signal</span>
              <span>Status</span>
              <span className="text-right">Time</span>
            </div>
            {filtered.map((r) => (
              <MentionTableRow key={r.recordId} {...rowProps(r)} />
            ))}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && layout === 'feed' && (
        <div className="flex flex-col gap-2 px-5 py-4" data-testid="mention-list">
          {filtered.map((r) => (
            <MentionFeedCard key={r.recordId} {...rowProps(r)} />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && layout === 'board' && (
        <div
          className="flex items-start gap-3 overflow-x-auto px-5 py-4"
          data-testid="mention-list"
        >
          {BOARD_COLS.map((col) => {
            const cards = filtered.filter((r) => (r.data.status ?? 'new') === col.id)
            return (
              <div
                key={col.id}
                className="flex w-[292px] shrink-0 flex-col gap-2 rounded-xl border border-border bg-sidebar p-2.5"
              >
                <div className="flex items-center gap-2 px-1 pb-1 pt-0.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: col.dot }}
                    aria-hidden
                  />
                  <span className="text-[12px] font-bold text-foreground">{col.label}</span>
                  <span className="ml-auto rounded-full bg-accent px-2 py-px font-mono text-[11px] tabular-nums text-muted-foreground">
                    {cards.length}
                  </span>
                </div>
                {cards.map((r) => (
                  <MentionBoardCard
                    key={r.recordId}
                    mention={r.data}
                    assigneeName={
                      r.data.assigned_to ? (getName(r.data.assigned_to) ?? 'someone') : null
                    }
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
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
          <div className="flex">
            {peers.slice(0, 5).map((p) => (
              <span
                key={p.userId}
                data-testid="presence-peer"
                title={p.userName ?? 'teammate'}
                className="-mr-[7px] inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold text-white last:mr-0"
                style={{ backgroundColor: getUserColor(p.userId) }}
              >
                {(p.userName ?? '?').slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          <span className="hidden text-[11.5px] text-tertiary sm:inline">{peers.length} online</span>
        </>
      ) : (
        <span className="text-[11.5px] text-tertiary">
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
  layout,
  onLayoutChange,
}: {
  sources: string[]
  keywords: Array<{ recordId: string; data: Keyword }>
  filters: Filters
  onChange: (f: Filters) => void
  layout: Layout
  onLayoutChange: (l: Layout) => void
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: filters[key] === value ? null : value })

  const keywordTerm = filters.keywordId
    ? (keywords.find((k) => k.recordId === filters.keywordId)?.data.term ?? 'keyword')
    : null

  return (
    <div
      data-testid="filter-bar"
      className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5"
    >
      <StatusChip active={filters.status === null} onClick={() => set('status', filters.status)}>
        All
      </StatusChip>
      {STATUSES.map((s) => (
        <StatusChip
          key={s.id}
          active={filters.status === s.id}
          onClick={() => set('status', s.id)}
        >
          {s.label}
        </StatusChip>
      ))}

      <span className="mx-0.5 h-5 w-px bg-border" />

      <DropdownMenu>
        <DropdownMenu.Trigger active={filters.relevance !== null} className="h-[30px] rounded-lg">
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
        <DropdownMenu.Trigger active={filters.sentiment !== null} className="h-[30px] rounded-lg">
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
          <DropdownMenu.Trigger active={filters.source !== null} className="h-[30px] rounded-lg">
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
          <DropdownMenu.Trigger active={filters.keywordId !== null} className="h-[30px] rounded-lg">
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

      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold tracking-wide text-tertiary">
          LAYOUT
        </span>
        <div className="inline-flex rounded-[9px] border border-border bg-accent p-0.5">
          {LAYOUTS.map((l) => {
            const Icon = l.icon
            const active = layout === l.id
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onLayoutChange(l.id)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-[26px] items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-semibold transition-colors',
                  active
                    ? 'bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
                    : 'text-tertiary hover:text-foreground',
                )}
              >
                <Icon className="h-[13px] w-[13px]" strokeWidth={2} aria-hidden />
                {l.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatusChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-[30px] items-center rounded-lg border px-3 text-[12px] font-semibold transition-colors',
        active
          ? 'border-primary/25 bg-primary/[0.08] text-primary'
          : 'border-input bg-background text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function timeShort(iso?: string): string {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const ENG_UNIT: Record<string, string> = {
  points: 'pts',
  likes: 'likes',
  stars: 'stars',
  views: 'views',
  comments: 'comments',
  replies: 'replies',
  reactions: 'reactions',
}

function engagementLabel(eng?: Record<string, number> | string): string {
  if (!eng) return '—'
  // Defensive: hand-seeded or legacy rows may carry the JSON as a string.
  if (typeof eng === 'string') {
    try {
      eng = JSON.parse(eng) as Record<string, number>
    } catch {
      return '—'
    }
  }
  const order = ['points', 'likes', 'stars', 'views', 'comments', 'replies', 'reactions']
  const key = order.find((k) => eng[k] != null) ?? Object.keys(eng)[0]
  if (!key || eng[key] == null) return '—'
  const v = eng[key]
  const num = v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(v)
  return `${num} ${ENG_UNIT[key] ?? key}`
}

/** Status pill — carries the `status-badge` testid the specs assert on. */
function StatusPill({ status, className }: { status: MentionStatus; className?: string }) {
  const s = STATUS_PILL[status]
  return (
    <span
      data-testid="status-badge"
      className={cn(
        'inline-flex h-5 items-center rounded-md px-2 font-mono text-[10.5px] font-semibold capitalize',
        className,
      )}
      style={{ background: s.bg, color: s.color }}
    >
      {status}
    </span>
  )
}

function AssigneeAvatar({
  userId,
  name,
  size = 22,
}: {
  userId: string
  name: string
  size?: number
}) {
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: getUserColor(userId), width: size, height: size }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/** A small square icon button used in the hover action clusters. */
function IconButton({
  title,
  onClick,
  active,
  testId,
  children,
}: {
  title: string
  onClick?: () => void
  active?: boolean
  testId?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'inline-flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-input bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
        active && 'border-primary/40 bg-primary/[0.08] text-primary',
      )}
    >
      {children}
    </button>
  )
}

// ─── Triage menus (status + assign) — shared by Table & Feed ─────────────────

function StatusMenu({
  recordId,
  currentStatus,
  onTriage,
  triggerClassName,
}: {
  recordId: string
  currentStatus: MentionStatus
  onTriage: (recordId: string, patch: Partial<Mention>) => Promise<void>
  triggerClassName?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        chevron={false}
        data-testid="status-menu-trigger"
        title="Set status"
        className={cn(
          'h-[26px] w-[26px] justify-center rounded-[7px] border-input p-0',
          triggerClassName,
        )}
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
  )
}

function AssignMenu({
  recordId,
  mention,
  currentStatus,
  onTriage,
  triggerClassName,
}: {
  recordId: string
  mention: Mention
  currentStatus: MentionStatus
  onTriage: (recordId: string, patch: Partial<Mention>) => Promise<void>
  triggerClassName?: string
}) {
  const { users } = useUserLookup()
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        chevron={false}
        data-testid="assign-menu-trigger"
        title="Assign"
        className={cn(
          'h-[26px] w-[26px] justify-center rounded-[7px] border-input p-0',
          triggerClassName,
        )}
      >
        <UserPlus className="h-3.5 w-3.5" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Label>Assign to</DropdownMenu.Label>
        {users.map((u) => (
          <DropdownMenu.Item
            key={u.id}
            selected={mention.assigned_to === u.id}
            onClick={() => onTriage(recordId, { assigned_to: u.id, status: 'assigned' })}
          >
            {u.name || u.email}
          </DropdownMenu.Item>
        ))}
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          // Empty string (not undefined) so the merge actually clears it.
          onClick={() => onTriage(recordId, { assigned_to: '', status: currentStatus })}
        >
          Unassign
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}

// ─── Table row ───────────────────────────────────────────────────────────────

interface RowProps {
  recordId: string
  mention: Mention
  canTriage: boolean
  assigneeName: string | null
  onTriage: (recordId: string, patch: Partial<Mention>) => Promise<void>
}

function MentionTableRow({ recordId, mention: m, canTriage, assigneeName, onTriage }: RowProps) {
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const currentStatus = m.status ?? 'new'
  const relevance = m.relevance ?? 'pending'
  const sentiment = m.sentiment ?? 'pending'
  const src = sourceMeta(m.source)
  const dim = currentStatus === 'resolved' || currentStatus === 'ignored'
  const showNotes = notesOpen || !!m.notes

  return (
    <div
      data-testid="mention-row"
      data-status={currentStatus}
      data-source-id={m.source_id}
      data-relevance={relevance}
      className={cn(
        // scroll-mt clears the sticky PageHeader, so scroll-into-view
        // (keyboard nav, tests, anchors) never lands a row underneath it.
        'group scroll-mt-[60px] border-b border-border transition-colors hover:bg-[#fafbfc] motion-safe:animate-in',
        dim && 'opacity-60',
      )}
      style={ENTER_STYLE}
    >
      <div className={cn(TABLE_GRID, 'px-5 py-[11px]')}>
        {/* Priority */}
        <div className="flex items-center gap-2" title={`AI relevance: ${relevance}`}>
          <span
            className="h-[26px] w-[3px] shrink-0 rounded-sm"
            style={{ background: REL_COLOR[relevance] }}
            aria-hidden
          />
          <span
            className="text-[11px] font-semibold capitalize"
            style={{ color: REL_COLOR[relevance] }}
          >
            {relevance === 'pending' ? 'scoring' : relevance}
          </span>
        </div>

        {/* Source */}
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: src.color }}
            aria-hidden
          />
          <span className="truncate font-mono text-[11px] text-muted-foreground">{m.source}</span>
        </div>

        {/* Mention */}
        <div className="min-w-0">
          {m.url ? (
            <a
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-[13px] font-semibold text-foreground hover:text-primary"
            >
              {m.title || m.body?.slice(0, 120) || m.url}
            </a>
          ) : (
            <span className="block truncate text-[13px] font-semibold text-foreground">
              {m.title || m.body?.slice(0, 120) || '—'}
            </span>
          )}
          <div className="mt-px flex min-w-0 items-center gap-1.5 text-[11.5px]">
            {m.author && <span className="shrink-0 text-tertiary">{m.author}</span>}
            {m.author && m.body && <span className="text-tertiary/60">·</span>}
            {m.body && <span className="truncate text-muted-foreground">{m.body}</span>}
          </div>
        </div>

        {/* Sentiment */}
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: SENT_COLOR[sentiment] }}
            aria-hidden
          />
          <span className="text-[12px] capitalize text-muted-foreground">
            {sentiment === 'pending' ? '…' : sentiment}
          </span>
        </div>

        {/* Signal */}
        <div className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {engagementLabel(m.engagement)}
        </div>

        {/* Status + hover action cluster */}
        <div className="relative flex items-center">
          <StatusPill status={currentStatus} />
          {canTriage && (
            <div
              className="absolute inset-y-0 left-0 flex items-center gap-1 pl-5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              style={{ background: 'linear-gradient(90deg, transparent, #fafbfc 22%)' }}
            >
              <StatusMenu
                recordId={recordId}
                currentStatus={currentStatus}
                onTriage={onTriage}
              />
              <AssignMenu
                recordId={recordId}
                mention={m}
                currentStatus={currentStatus}
                onTriage={onTriage}
              />
              <IconButton
                title="Note"
                testId="note-toggle"
                active={showNotes}
                onClick={() => setNotesOpen((v) => !v)}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              </IconButton>
            </div>
          )}
        </div>

        {/* Time */}
        <div className="flex items-center justify-end gap-2">
          {assigneeName && m.assigned_to && (
            <AssigneeAvatar userId={m.assigned_to} name={assigneeName} />
          )}
          <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-tertiary">
            {timeShort(m.published_at)}
          </span>
        </div>
      </div>

      {/* Note line — ghost input, visible when open or when a note exists */}
      {canTriage && showNotes && (
        <div className="px-5 pb-2.5">
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
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-foreground outline-none transition-colors placeholder:text-tertiary hover:border-border focus:border-input focus:bg-panel"
          />
        </div>
      )}
    </div>
  )
}

// ─── Feed card ───────────────────────────────────────────────────────────────

function MentionFeedCard({ recordId, mention: m, canTriage, assigneeName, onTriage }: RowProps) {
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const currentStatus = m.status ?? 'new'
  const relevance = m.relevance ?? 'pending'
  const sentiment = m.sentiment ?? 'pending'
  const src = sourceMeta(m.source)
  const dim = currentStatus === 'resolved' || currentStatus === 'ignored'
  const showNotes = notesOpen || !!m.notes
  const relColor = REL_COLOR[relevance]

  return (
    <div
      data-testid="mention-row"
      data-status={currentStatus}
      data-source-id={m.source_id}
      data-relevance={relevance}
      className={cn(
        'group flex scroll-mt-[60px] items-start gap-3 rounded-[11px] border border-border bg-background p-[13px] transition-colors hover:bg-[#fafbfc] motion-safe:animate-in',
        dim && 'opacity-[0.62]',
      )}
      style={ENTER_STYLE}
    >
      {/* relevance rule */}
      <span
        className="w-[3px] shrink-0 self-stretch rounded-[3px]"
        style={{ background: relColor }}
        aria-hidden
      />

      {/* source chip */}
      <div
        className="mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
        style={{ background: `${src.color}1f` }}
      >
        <span className="font-mono text-[11px] font-semibold" style={{ color: src.color }}>
          {src.abbr}
        </span>
      </div>

      {/* body */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {m.url ? (
            <a
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className="text-[13.5px] font-semibold leading-snug text-foreground hover:text-primary"
            >
              {m.title || m.body?.slice(0, 120) || m.url}
            </a>
          ) : (
            <span className="text-[13.5px] font-semibold leading-snug text-foreground">
              {m.title || m.body?.slice(0, 120) || '—'}
            </span>
          )}
          <span
            className="inline-flex h-[18px] items-center rounded-[5px] px-[7px] text-[10px] font-semibold"
            style={{ background: `${relColor}1a`, color: relColor }}
          >
            {relevance === 'pending'
              ? 'Scoring…'
              : `${relevance[0].toUpperCase()}${relevance.slice(1)} signal`}
          </span>
        </div>
        {m.body && (
          <p className="mt-[3px] line-clamp-1 text-[12.5px] leading-normal text-muted-foreground">
            {m.body}
          </p>
        )}
        <div className="mt-[7px] flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: src.color }}
              aria-hidden
            />
            {m.source}
          </span>
          {m.author && <span className="text-[11.5px] text-tertiary">{m.author}</span>}
          <span className="font-mono text-[11px] text-tertiary">
            {engagementLabel(m.engagement)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] capitalize text-muted-foreground">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: SENT_COLOR[sentiment] }}
              aria-hidden
            />
            {sentiment === 'pending' ? '…' : sentiment}
          </span>
          {assigneeName && <span className="text-[11.5px] text-tertiary">→ {assigneeName}</span>}
        </div>

        {canTriage && showNotes && (
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
            className="mt-2 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-foreground outline-none transition-colors placeholder:text-tertiary hover:border-border focus:border-input focus:bg-panel"
          />
        )}
      </div>

      {/* right column: status + time + hover actions */}
      <div className="flex shrink-0 flex-col items-end gap-2.5">
        <div className="flex items-center gap-2">
          <StatusPill status={currentStatus} />
          <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-tertiary">
            {timeShort(m.published_at)}
          </span>
        </div>
        {canTriage && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <StatusMenu recordId={recordId} currentStatus={currentStatus} onTriage={onTriage} />
            <AssignMenu
              recordId={recordId}
              mention={m}
              currentStatus={currentStatus}
              onTriage={onTriage}
            />
            <IconButton
              title="Note"
              testId="note-toggle"
              active={showNotes}
              onClick={() => setNotesOpen((v) => !v)}
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Board card ──────────────────────────────────────────────────────────────

function MentionBoardCard({
  mention: m,
  assigneeName,
}: {
  mention: Mention
  assigneeName: string | null
}) {
  const currentStatus = m.status ?? 'new'
  const relevance = m.relevance ?? 'pending'
  const sentiment = m.sentiment ?? 'pending'
  const src = sourceMeta(m.source)
  const relColor = REL_COLOR[relevance]

  return (
    <a
      href={m.url || undefined}
      target={m.url ? '_blank' : undefined}
      rel="noreferrer"
      data-testid="mention-row"
      data-status={currentStatus}
      data-source-id={m.source_id}
      data-relevance={relevance}
      className="block rounded-[10px] border border-border bg-background p-3 shadow-card transition-shadow hover:shadow-card-hover motion-safe:animate-in"
      style={ENTER_STYLE}
    >
      <div className="mb-[7px] flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: src.color }} aria-hidden />
        <span className="font-mono text-[10.5px] text-muted-foreground">{m.source}</span>
        <span className="ml-auto font-mono text-[10.5px] tabular-nums text-tertiary">
          {timeShort(m.published_at)}
        </span>
      </div>
      <div className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-foreground">
        {m.title || m.body?.slice(0, 120) || m.url}
      </div>
      <div className="mt-[9px] flex items-center gap-2">
        <span
          className="inline-flex h-[18px] items-center rounded-[5px] px-[7px] text-[10px] font-semibold"
          style={{ background: `${relColor}1a`, color: relColor }}
        >
          {relevance === 'pending'
            ? 'Scoring…'
            : `${relevance[0].toUpperCase()}${relevance.slice(1)} signal`}
        </span>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: SENT_COLOR[sentiment] }}
          aria-hidden
        />
        {assigneeName && m.assigned_to && (
          <span className="ml-auto">
            <AssigneeAvatar userId={m.assigned_to} name={assigneeName} size={22} />
          </span>
        )}
      </div>
    </a>
  )
}
