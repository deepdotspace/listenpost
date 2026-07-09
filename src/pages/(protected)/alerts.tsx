/**
 * Delivery — outbound delivery config: alert rules (Slack/webhook routing),
 * webhook endpoints (admin-only), and email digests.
 */

import { useState, type ReactNode } from 'react'
import { useQuery, useMutations, useUser } from 'deepspace'
import { Plus, MoreVertical } from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Modal,
  ConfirmModal,
  EmptyState,
  DropdownMenu,
  useToast,
  cn,
} from '@/components/ui'
import { PageHeader, SectionLabel } from '../../components/PageHeader'
import type { AlertRule, AlertRuleMatch, Digest, Sentiment, WebhookEndpoint } from '../../types'

const SOURCES = ['hackernews', 'reddit', 'bluesky', 'youtube', 'github', 'news', 'web', 'x', 'linkedin']
const SENTIMENTS: Sentiment[] = ['positive', 'negative', 'neutral']
const RELEVANCES = ['low', 'medium', 'high'] as const

/** Colored square per delivery channel. */
const CHANNEL_COLOR: Record<string, string> = {
  slack: '#4a154b',
  email: '#2563eb',
  webhook: '#7a8290',
}

type RuleEditor = {
  recordId: string | null
  name: string
  channel: 'slack' | 'webhook'
  channelId: string
  endpointId: string
  match: AlertRuleMatch
}

const EMPTY_RULE: RuleEditor = {
  recordId: null,
  name: '',
  channel: 'slack',
  channelId: '',
  endpointId: '',
  match: {},
}

// ─── Small presentational atoms ──────────────────────────────────────────────

/** 32×18 accent switch — drives the same is_active mutation as before. */
function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors',
        on ? 'bg-primary' : 'bg-[#d5d9df]',
      )}
    >
      <span
        className={cn(
          'h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform',
          on && 'translate-x-[14px]',
        )}
      />
    </button>
  )
}

function RowMenu({
  onEdit,
  onToggle,
  active,
  onDelete,
}: {
  onEdit?: () => void
  onToggle: () => void
  active: boolean
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        chevron={false}
        aria-label="Actions"
        className="h-[26px] w-[26px] justify-center border-transparent px-0 text-tertiary hover:bg-secondary hover:text-foreground [&_svg]:size-[15px]"
      >
        <MoreVertical aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {onEdit && <DropdownMenu.Item onClick={onEdit}>Edit</DropdownMenu.Item>}
        <DropdownMenu.Item onClick={onToggle}>{active ? 'Pause' : 'Resume'}</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item className="text-destructive hover:text-destructive" onClick={onDelete}>
          Delete
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}

// ─── Match editor (shared by rules / webhooks / digests) ─────────────────────

function MatchEditor({
  match,
  onChange,
}: {
  match: AlertRuleMatch
  onChange: (m: AlertRuleMatch) => void
}) {
  const toggleIn = (list: string[] | undefined, v: string) =>
    list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-24 shrink-0 text-[11.5px] text-muted-foreground">Sources</span>
        {SOURCES.map((s) => (
          <ToggleChip
            key={s}
            active={!!match.sources?.includes(s)}
            label={s}
            onClick={() => onChange({ ...match, sources: toggleIn(match.sources, s) })}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-24 shrink-0 text-[11.5px] text-muted-foreground">Sentiment</span>
        {SENTIMENTS.map((s) => (
          <ToggleChip
            key={s}
            active={!!match.sentiment?.includes(s)}
            label={s}
            onClick={() =>
              onChange({ ...match, sentiment: toggleIn(match.sentiment, s) as Sentiment[] })
            }
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-24 shrink-0 text-[11.5px] text-muted-foreground">Min relevance</span>
        {RELEVANCES.map((rel) => (
          <ToggleChip
            key={rel}
            active={match.relevance_min === rel}
            label={rel}
            onClick={() =>
              onChange({ ...match, relevance_min: match.relevance_min === rel ? undefined : rel })
            }
          />
        ))}
      </div>
      <p className="text-[11.5px] text-tertiary">Empty groups match everything.</p>
    </div>
  )
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-[22px] items-center rounded-md border px-1.5 font-mono text-[11px] transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-input text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

/** Two-option segmented control used in editors (channel, schedule). */
function SegmentedGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-accent p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'inline-flex h-[26px] items-center rounded-[7px] px-2.5 text-xs font-semibold transition-colors',
            value === opt
              ? 'bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-[13px] font-medium text-foreground">{children}</label>
}

function describeMatch(match: AlertRuleMatch | undefined): string {
  if (!match) return 'matches everything'
  const parts: string[] = []
  if (match.sources?.length) parts.push(`sources: ${match.sources.join(', ')}`)
  if (match.sentiment?.length) parts.push(`sentiment: ${match.sentiment.join('/')}`)
  if (match.relevance_min) parts.push(`relevance ≥ ${match.relevance_min}`)
  if (match.tags?.length) parts.push(`tags: ${match.tags.join(', ')}`)
  return parts.length ? parts.join(' · ') : 'matches everything'
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { user } = useUser()
  const isAdmin = user?.role === 'admin'
  const canEdit = user?.role === 'member' || user?.role === 'admin'

  const { records: rules } = useQuery<AlertRule>('alert_rules', { orderBy: 'createdAt' })
  const { records: endpoints } = useQuery<WebhookEndpoint>('webhook_endpoints', { limit: 50 })
  const { records: digests } = useQuery<Digest>('digests', { limit: 50 })
  const { create, put, remove } = useMutations<AlertRule>('alert_rules')
  const { success, error } = useToast()

  const [editing, setEditing] = useState<RuleEditor | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const ruleList = rules ?? []
  const slackRules = ruleList.filter((r) => r.data.channel === 'slack').length
  const endpointCount = (endpoints ?? []).length
  const digestCount = (digests ?? []).length
  const channelCount = [slackRules > 0, digestCount > 0, endpointCount > 0].filter(Boolean).length

  async function save() {
    if (!editing || !editing.name.trim()) return
    const data: AlertRule = {
      name: editing.name.trim(),
      channel: editing.channel,
      match: editing.match,
      target:
        editing.channel === 'slack'
          ? { channelId: editing.channelId.trim() }
          : { endpointId: editing.endpointId },
      is_active: 1,
    }
    try {
      if (editing.recordId) await put(editing.recordId, data)
      else await create(data)
      success('Rule saved')
      setEditing(null)
    } catch (err) {
      error('Save failed', String(err))
    }
  }

  function ruleTarget(r: AlertRule): string {
    if (r.channel === 'slack') return r.target?.channelId || 'no channel'
    if (r.channel === 'email') return r.target?.email || 'no address'
    const ep = (endpoints ?? []).find((e) => e.recordId === r.target?.endpointId)
    return ep?.data.label || ep?.data.url || 'missing endpoint'
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Delivery"
        meta={
          <span>
            {ruleList.length} {ruleList.length === 1 ? 'rule' : 'rules'} · {channelCount}{' '}
            {channelCount === 1 ? 'channel' : 'channels'}
          </span>
        }
        actions={
          canEdit && (
            <Button
              size="sm"
              data-testid="add-rule"
              className="h-8 gap-1.5 px-3 text-[12.5px] [&_svg]:size-3.5"
              onClick={() => setEditing({ ...EMPTY_RULE })}
            >
              <Plus aria-hidden />
              New rule
            </Button>
          )
        }
      />

      <div className="space-y-5 px-4 py-5 sm:px-5">
        {/* ── Alert rules ── */}
        <section>
          <SectionLabel className="mb-2.5 text-tertiary">Alert rules</SectionLabel>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            {ruleList.length === 0 ? (
              <EmptyState
                className="py-10"
                title="No rules yet"
                description='e.g. "negative sentiment → Slack #alerts"'
              />
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[620px]">
                  {ruleList.map((r) => {
                    const active = !!r.data.is_active
                    return (
                      <div
                        key={r.recordId}
                        data-testid="rule-row"
                        className={cn(
                          'group grid grid-cols-[1fr_130px_150px_54px_34px] items-center gap-3.5 border-b border-border px-[18px] py-[13px] transition-colors last:border-b-0 hover:bg-[#fafbfc]',
                          !active && 'opacity-60',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-foreground">
                            {r.data.name}
                          </div>
                          <div className="truncate text-[11.5px] text-tertiary">
                            {describeMatch(r.data.match)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px] capitalize text-muted-foreground">
                          <span
                            className="h-[7px] w-[7px] rounded-[2px]"
                            style={{ background: CHANNEL_COLOR[r.data.channel] ?? '#7a8290' }}
                          />
                          {r.data.channel}
                        </div>
                        <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                          {ruleTarget(r.data)}
                        </div>
                        <div className="flex justify-center">
                          <Toggle
                            on={active}
                            label={active ? 'Pause rule' : 'Resume rule'}
                            onClick={() => put(r.recordId, { is_active: active ? 0 : 1 })}
                          />
                        </div>
                        <div className="flex justify-center">
                          {canEdit && (
                            <RowMenu
                              active={active}
                              onToggle={() => put(r.recordId, { is_active: active ? 0 : 1 })}
                              onEdit={() =>
                                setEditing({
                                  recordId: r.recordId,
                                  name: r.data.name,
                                  channel: r.data.channel === 'webhook' ? 'webhook' : 'slack',
                                  channelId: r.data.target?.channelId ?? '',
                                  endpointId: r.data.target?.endpointId ?? '',
                                  match: r.data.match ?? {},
                                })
                              }
                              onDelete={() => setDeleting(r.recordId)}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Channels summary ── */}
        <section>
          <SectionLabel className="mb-2.5 text-tertiary">Channels</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ChannelCard
              name="Slack"
              active={slackRules > 0}
              activeLabel="Connected"
              meta={`${slackRules} ${slackRules === 1 ? 'rule' : 'rules'}`}
            />
            <ChannelCard
              name="Email"
              active={digestCount > 0}
              activeLabel="Verified"
              meta={`${digestCount} ${digestCount === 1 ? 'digest' : 'digests'}`}
            />
            <ChannelCard
              name="Webhook"
              active={endpointCount > 0}
              activeLabel="Active"
              meta={`${endpointCount} ${endpointCount === 1 ? 'endpoint' : 'endpoints'}`}
            />
          </div>
        </section>

        {/* Management sections (functional; kept below the summary) */}
        {isAdmin && <WebhooksSection />}
        <DigestsSection />
      </div>

      {/* Rule editor */}
      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <Modal.Header onClose={() => setEditing(null)}>
          <Modal.Title>{editing?.recordId ? 'Edit rule' : 'Add rule'}</Modal.Title>
        </Modal.Header>
        {editing && (
          <Modal.Body className="space-y-4">
            <div>
              <FieldLabel>Name</FieldLabel>
              <Input
                data-testid="rule-name"
                className="h-9 text-[13px]"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Negative sentiment → #alerts"
                autoFocus
              />
            </div>
            <div>
              <FieldLabel>Channel</FieldLabel>
              <SegmentedGroup
                options={['slack', 'webhook'] as const}
                value={editing.channel}
                onChange={(ch) => setEditing({ ...editing, channel: ch })}
              />
            </div>
            {editing.channel === 'slack' ? (
              <div>
                <FieldLabel>Slack channel ID</FieldLabel>
                <Input
                  className="h-9 font-mono text-[13px]"
                  value={editing.channelId}
                  onChange={(e) => setEditing({ ...editing, channelId: e.target.value })}
                  placeholder="C0123456789"
                />
              </div>
            ) : (
              <div>
                <FieldLabel>Webhook endpoint</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {(endpoints ?? []).map((ep) => (
                    <ToggleChip
                      key={ep.recordId}
                      active={editing.endpointId === ep.recordId}
                      label={ep.data.label || ep.data.url}
                      onClick={() => setEditing({ ...editing, endpointId: ep.recordId })}
                    />
                  ))}
                  {(endpoints ?? []).length === 0 && (
                    <p className="text-[11.5px] text-muted-foreground">
                      No endpoints — an admin can add one below.
                    </p>
                  )}
                </div>
              </div>
            )}
            <MatchEditor match={editing.match} onChange={(m) => setEditing({ ...editing, match: m })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button size="sm" data-testid="save-rule" onClick={save} disabled={!editing.name.trim()}>
                Save
              </Button>
            </div>
          </Modal.Body>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await remove(deleting)
          setDeleting(null)
        }}
        title="Delete rule?"
        confirmText="Delete"
      />
    </div>
  )
}

function ChannelCard({
  name,
  active,
  activeLabel,
  meta,
}: {
  name: string
  active: boolean
  activeLabel: string
  meta: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-foreground">{name}</span>
        {active ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0f9d6b]">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {activeLabel}
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-tertiary">Not configured</span>
        )}
      </div>
      <div className="mt-1.5 text-[12px] text-tertiary">{meta}</div>
    </div>
  )
}

// ─── Webhook endpoints (admin) ───────────────────────────────────────────────

function WebhooksSection() {
  const { records: endpoints } = useQuery<WebhookEndpoint>('webhook_endpoints', { orderBy: 'createdAt' })
  const { create, put, remove } = useMutations<WebhookEndpoint>('webhook_endpoints')
  const { success, error } = useToast()

  const [editing, setEditing] = useState<null | {
    recordId: string | null
    label: string
    url: string
    secret: string
    filters: AlertRuleMatch
  }>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  function newSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(24))
    return 'whsec_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  async function save() {
    if (!editing || !editing.url.trim()) return
    const data: WebhookEndpoint = {
      label: editing.label.trim(),
      url: editing.url.trim(),
      secret: editing.secret,
      filters: editing.filters,
      is_active: 1,
    }
    try {
      if (editing.recordId) await put(editing.recordId, data)
      else await create(data)
      success('Endpoint saved')
      setEditing(null)
    } catch (err) {
      error('Save failed', String(err))
    }
  }

  const list = endpoints ?? []

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel className="text-tertiary">Webhook endpoints</SectionLabel>
          <p className="mt-0.5 text-[11.5px] text-tertiary">
            Deliveries are HMAC-signed (X-Octolens-Signature). Discord-compatible.
          </p>
        </div>
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs"
          data-testid="add-endpoint"
          onClick={() =>
            setEditing({ recordId: null, label: '', url: '', secret: newSecret(), filters: {} })
          }
        >
          Add endpoint
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        {list.length === 0 ? (
          <EmptyState
            className="py-10"
            title="No endpoints"
            description="POST scored mentions anywhere — Zapier, Discord, your backend."
          />
        ) : (
          list.map((ep) => {
            const active = !!ep.data.is_active
            const failing = (ep.data.failure_count ?? 0) > 0
            return (
              <div
                key={ep.recordId}
                data-testid="endpoint-row"
                className={cn(
                  'group grid grid-cols-[1fr_110px_54px_34px] items-center gap-3.5 border-b border-border px-[18px] py-[13px] transition-colors last:border-b-0 hover:bg-[#fafbfc]',
                  !active && 'opacity-60',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[12px] text-foreground">{ep.data.url}</div>
                  <div className="truncate text-[11.5px] text-tertiary">
                    {ep.data.label || 'endpoint'}
                    {ep.data.last_delivery_at &&
                      ` · last delivery ${new Date(ep.data.last_delivery_at).toLocaleString()}`}
                  </div>
                </div>
                <div
                  className="flex items-center gap-1.5 text-[11.5px] font-semibold"
                  style={{ color: failing ? '#d64b4b' : '#0f9d6b' }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: failing ? '#e0645c' : '#10b981' }}
                  />
                  {failing ? 'Failing' : 'Healthy'}
                </div>
                <div className="flex justify-center">
                  <Toggle
                    on={active}
                    label={active ? 'Pause endpoint' : 'Resume endpoint'}
                    onClick={() => put(ep.recordId, { is_active: active ? 0 : 1 })}
                  />
                </div>
                <div className="flex justify-center">
                  <RowMenu
                    active={active}
                    onToggle={() => put(ep.recordId, { is_active: active ? 0 : 1 })}
                    onEdit={() =>
                      setEditing({
                        recordId: ep.recordId,
                        label: ep.data.label ?? '',
                        url: ep.data.url,
                        secret: ep.data.secret ?? '',
                        filters: ep.data.filters ?? {},
                      })
                    }
                    onDelete={() => setDeleting(ep.recordId)}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <Modal.Header onClose={() => setEditing(null)}>
          <Modal.Title>{editing?.recordId ? 'Edit endpoint' : 'Add endpoint'}</Modal.Title>
        </Modal.Header>
        {editing && (
          <Modal.Body className="space-y-4">
            <div>
              <FieldLabel>Label</FieldLabel>
              <Input
                className="h-9 text-[13px]"
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                placeholder="Zapier"
              />
            </div>
            <div>
              <FieldLabel>URL</FieldLabel>
              <Input
                data-testid="endpoint-url"
                className="h-9 font-mono text-[13px]"
                value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://example.com/webhooks/octolens"
              />
            </div>
            <div>
              <FieldLabel>Signing secret</FieldLabel>
              <div className="flex gap-2">
                <Input value={editing.secret} readOnly className="h-9 font-mono text-[11px]" />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing({ ...editing, secret: newSecret() })}
                >
                  Rotate
                </Button>
              </div>
            </div>
            <MatchEditor
              match={editing.filters}
              onChange={(m) => setEditing({ ...editing, filters: m })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button size="sm" data-testid="save-endpoint" onClick={save} disabled={!editing.url.trim()}>
                Save
              </Button>
            </div>
          </Modal.Body>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await remove(deleting)
          setDeleting(null)
        }}
        title="Delete endpoint?"
        confirmText="Delete"
      />
    </section>
  )
}

// ─── Digests ─────────────────────────────────────────────────────────────────

function DigestsSection() {
  const { records: digests } = useQuery<Digest>('digests', { orderBy: 'createdAt' })
  const { create, put, remove } = useMutations<Digest>('digests')
  const { success, error } = useToast()
  const { user } = useUser()
  const canEdit = user?.role === 'member' || user?.role === 'admin'

  const [editing, setEditing] = useState<null | {
    recordId: string | null
    schedule: 'daily' | 'weekly'
    time: string
    timezone: string
    email: string
    filters: AlertRuleMatch
  }>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function save() {
    if (!editing || !editing.email.trim()) return
    const data: Digest = {
      schedule: editing.schedule,
      time: editing.time || '09:00',
      timezone: editing.timezone || 'UTC',
      filters: editing.filters,
      target: { email: editing.email.trim() },
      is_active: 1,
    }
    try {
      if (editing.recordId) await put(editing.recordId, data)
      else await create(data)
      success('Digest saved')
      setEditing(null)
    } catch (err) {
      error('Save failed', String(err))
    }
  }

  const list = digests ?? []

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel className="text-tertiary">Email digests</SectionLabel>
          <p className="mt-0.5 text-[11.5px] text-tertiary">
            A daily or weekly summary of matching mentions, in your inbox.
          </p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            data-testid="add-digest"
            onClick={() =>
              setEditing({
                recordId: null,
                schedule: 'daily',
                time: '09:00',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                email: '',
                filters: {},
              })
            }
          >
            Add digest
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        {list.length === 0 ? (
          <EmptyState
            className="py-10"
            title="No digests"
            description="Scheduled summaries keep the whole team in the loop without another dashboard."
          />
        ) : (
          list.map((d) => {
            const active = !!d.data.is_active
            return (
              <div
                key={d.recordId}
                data-testid="digest-row"
                className={cn(
                  'group grid grid-cols-[1fr_54px_34px] items-center gap-3.5 border-b border-border px-[18px] py-[13px] transition-colors last:border-b-0 hover:bg-[#fafbfc]',
                  !active && 'opacity-60',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-foreground">
                    {d.data.target?.email}
                  </div>
                  <div className="truncate font-mono text-[11.5px] text-tertiary">
                    {d.data.schedule} at {d.data.time} ({d.data.timezone})
                    {d.data.last_sent_at &&
                      ` · last sent ${new Date(d.data.last_sent_at).toLocaleString()}`}
                  </div>
                </div>
                <div className="flex justify-center">
                  <Toggle
                    on={active}
                    label={active ? 'Pause digest' : 'Resume digest'}
                    onClick={() => put(d.recordId, { is_active: active ? 0 : 1 })}
                  />
                </div>
                <div className="flex justify-center">
                  {canEdit && (
                    <RowMenu
                      active={active}
                      onToggle={() => put(d.recordId, { is_active: active ? 0 : 1 })}
                      onEdit={() =>
                        setEditing({
                          recordId: d.recordId,
                          schedule: d.data.schedule,
                          time: d.data.time ?? '09:00',
                          timezone: d.data.timezone ?? 'UTC',
                          email: d.data.target?.email ?? '',
                          filters: d.data.filters ?? {},
                        })
                      }
                      onDelete={() => setDeleting(d.recordId)}
                    />
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <Modal.Header onClose={() => setEditing(null)}>
          <Modal.Title>{editing?.recordId ? 'Edit digest' : 'Add digest'}</Modal.Title>
        </Modal.Header>
        {editing && (
          <Modal.Body className="space-y-4">
            <div>
              <FieldLabel>Email</FieldLabel>
              <Input
                data-testid="digest-email"
                className="h-9 text-[13px]"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="team@company.com"
                autoFocus
              />
            </div>
            <div>
              <FieldLabel>Schedule</FieldLabel>
              <SegmentedGroup
                options={['daily', 'weekly'] as const}
                value={editing.schedule}
                onChange={(s) => setEditing({ ...editing, schedule: s })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Time (HH:MM)</FieldLabel>
                <Input
                  className="h-9 font-mono text-[13px]"
                  value={editing.time}
                  onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                  placeholder="09:00"
                />
              </div>
              <div>
                <FieldLabel>Timezone</FieldLabel>
                <Input
                  className="h-9 font-mono text-[13px]"
                  value={editing.timezone}
                  onChange={(e) => setEditing({ ...editing, timezone: e.target.value })}
                  placeholder="America/New_York"
                />
              </div>
            </div>
            <MatchEditor
              match={editing.filters}
              onChange={(m) => setEditing({ ...editing, filters: m })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button size="sm" data-testid="save-digest" onClick={save} disabled={!editing.email.trim()}>
                Save
              </Button>
            </div>
          </Modal.Body>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await remove(deleting)
          setDeleting(null)
        }}
        title="Delete digest?"
        confirmText="Delete"
      />
    </section>
  )
}
