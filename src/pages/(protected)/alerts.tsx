/**
 * Delivery — outbound delivery config: alert rules (Slack/webhook routing),
 * webhook endpoints (admin-only), and email digests.
 */

import { useState, type ReactNode } from 'react'
import { useQuery, useMutations, useUser } from 'deepspace'
import { Badge, Button, Input, Modal, ConfirmModal, EmptyState, useToast, cn } from '@/components/ui'
import { PageHeader, SectionLabel } from '../../components/PageHeader'
import type { AlertRule, AlertRuleMatch, Digest, Sentiment, WebhookEndpoint } from '../../types'

const SOURCES = ['hackernews', 'reddit', 'bluesky', 'youtube', 'github', 'news', 'web', 'x', 'linkedin']
const SENTIMENTS: Sentiment[] = ['positive', 'negative', 'neutral']
const RELEVANCES = ['low', 'medium', 'high'] as const

export default function AlertsPage() {
  const { user } = useUser()
  const isAdmin = user?.role === 'admin'

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Delivery"
        meta={<span>Slack, webhooks &amp; email digests</span>}
      />
      <div className="space-y-4 px-4 py-4 sm:px-6">
        <RulesSection />
        {isAdmin && <WebhooksSection />}
        <DigestsSection />
      </div>
    </div>
  )
}

// ─── Shared section + row scaffolding ────────────────────────────────────────

function Section({
  label,
  description,
  action,
  children,
}: {
  label: string
  description: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card/50">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <SectionLabel>{label}</SectionLabel>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** Compact row-action cluster — quiet until the row is hovered/focused. */
function RowActions({
  active,
  onToggle,
  onEdit,
  onDelete,
}: {
  active: boolean
  onToggle: () => void
  onEdit?: () => void
  onDelete: () => void
}) {
  const base =
    'inline-flex h-6 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground'
  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <button type="button" className={base} onClick={onToggle}>
        {active ? 'Pause' : 'Resume'}
      </button>
      {onEdit && (
        <button type="button" className={base} onClick={onEdit}>
          Edit
        </button>
      )}
      <button type="button" className={cn(base, 'hover:text-destructive')} onClick={onDelete}>
        Delete
      </button>
    </div>
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
      <p className="text-[11.5px] text-muted-foreground/80">Empty groups match everything.</p>
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
          : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
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
    <div className="inline-flex rounded-md border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'inline-flex h-6 items-center rounded px-2.5 text-xs font-medium transition-colors',
            value === opt
              ? 'bg-secondary text-foreground'
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

// ─── Alert rules ─────────────────────────────────────────────────────────────

function RulesSection() {
  const { records: rules } = useQuery<AlertRule>('alert_rules', { orderBy: 'createdAt' })
  const { records: endpoints } = useQuery<WebhookEndpoint>('webhook_endpoints', { limit: 50 })
  const { create, put, remove } = useMutations<AlertRule>('alert_rules')
  const { success, error } = useToast()
  const { user } = useUser()
  const canEdit = user?.role === 'member' || user?.role === 'admin'

  const [editing, setEditing] = useState<null | {
    recordId: string | null
    name: string
    channel: 'slack' | 'webhook'
    channelId: string
    endpointId: string
    match: AlertRuleMatch
  }>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

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
    if (r.channel === 'slack') return `slack · ${r.target?.channelId || 'no channel'}`
    const ep = (endpoints ?? []).find((e) => e.recordId === r.target?.endpointId)
    return `webhook · ${ep?.data.label || ep?.data.url || 'missing endpoint'}`
  }

  return (
    <Section
      label="Alert rules"
      description="Real-time routing — a scored mention that matches goes straight to the target."
      action={
        canEdit && (
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            data-testid="add-rule"
            onClick={() =>
              setEditing({ recordId: null, name: '', channel: 'slack', channelId: '', endpointId: '', match: {} })
            }
          >
            Add rule
          </Button>
        )
      }
    >
      {(rules ?? []).length === 0 ? (
        <EmptyState
          className="py-10"
          title="No rules yet"
          description='e.g. "negative sentiment → Slack #alerts"'
        />
      ) : (
        <ul className="divide-y divide-border">
          {(rules ?? []).map((r) => (
            <li
              key={r.recordId}
              data-testid="rule-row"
              className={cn(
                'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40',
                !r.data.is_active && 'opacity-55',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium text-foreground">{r.data.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {ruleTarget(r.data)}
                  </span>
                  {!r.data.is_active && (
                    <Badge variant="secondary" size="sm">
                      paused
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">
                  {describeMatch(r.data.match)}
                </p>
              </div>
              {canEdit && (
                <RowActions
                  active={!!r.data.is_active}
                  onToggle={() => put(r.recordId, { is_active: r.data.is_active ? 0 : 1 })}
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
            </li>
          ))}
        </ul>
      )}

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
                className="h-8 text-[13px]"
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
                  className="h-8 font-mono text-[13px]"
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
              <Button size="sm" variant="secondary" className="h-8 text-[13px]" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-[13px]"
                data-testid="save-rule"
                onClick={save}
                disabled={!editing.name.trim()}
              >
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
      />
    </Section>
  )
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

  return (
    <Section
      label="Webhook endpoints"
      description="Deliveries are HMAC-signed (X-Octolens-Signature). Discord-compatible."
      action={
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
      }
    >
      {(endpoints ?? []).length === 0 ? (
        <EmptyState
          className="py-10"
          title="No endpoints"
          description="POST scored mentions anywhere — Zapier, Discord, your backend."
        />
      ) : (
        <ul className="divide-y divide-border">
          {(endpoints ?? []).map((ep) => (
            <li
              key={ep.recordId}
              data-testid="endpoint-row"
              className={cn(
                'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40',
                !ep.data.is_active && 'opacity-55',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium text-foreground">
                    {ep.data.label || 'endpoint'}
                  </span>
                  {!ep.data.is_active && (
                    <Badge variant="secondary" size="sm">
                      paused
                    </Badge>
                  )}
                  {(ep.data.failure_count ?? 0) > 0 && (
                    <Badge variant="destructive" size="sm">
                      {ep.data.failure_count} failures
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">
                  {ep.data.url}
                </p>
                {ep.data.last_delivery_at && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    last delivery {new Date(ep.data.last_delivery_at).toLocaleString()}
                  </p>
                )}
              </div>
              <RowActions
                active={!!ep.data.is_active}
                onToggle={() => put(ep.recordId, { is_active: ep.data.is_active ? 0 : 1 })}
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
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <Modal.Header onClose={() => setEditing(null)}>
          <Modal.Title>{editing?.recordId ? 'Edit endpoint' : 'Add endpoint'}</Modal.Title>
        </Modal.Header>
        {editing && (
          <Modal.Body className="space-y-4">
            <div>
              <FieldLabel>Label</FieldLabel>
              <Input
                className="h-8 text-[13px]"
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                placeholder="Zapier"
              />
            </div>
            <div>
              <FieldLabel>URL</FieldLabel>
              <Input
                data-testid="endpoint-url"
                className="h-8 font-mono text-[13px]"
                value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://example.com/webhooks/octolens"
              />
            </div>
            <div>
              <FieldLabel>Signing secret</FieldLabel>
              <div className="flex gap-2">
                <Input value={editing.secret} readOnly className="h-8 font-mono text-[11px]" />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 text-[13px]"
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
              <Button size="sm" variant="secondary" className="h-8 text-[13px]" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-[13px]"
                data-testid="save-endpoint"
                onClick={save}
                disabled={!editing.url.trim()}
              >
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
      />
    </Section>
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

  return (
    <Section
      label="Email digests"
      description="A daily or weekly summary of matching mentions, in your inbox."
      action={
        canEdit && (
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
        )
      }
    >
      {(digests ?? []).length === 0 ? (
        <EmptyState
          className="py-10"
          title="No digests"
          description="Scheduled summaries keep the whole team in the loop without another dashboard."
        />
      ) : (
        <ul className="divide-y divide-border">
          {(digests ?? []).map((d) => (
            <li
              key={d.recordId}
              data-testid="digest-row"
              className={cn(
                'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40',
                !d.data.is_active && 'opacity-55',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium text-foreground">
                    {d.data.target?.email}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {d.data.schedule} at {d.data.time} ({d.data.timezone})
                  </span>
                  {!d.data.is_active && (
                    <Badge variant="secondary" size="sm">
                      paused
                    </Badge>
                  )}
                </div>
                {d.data.last_sent_at && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    last sent {new Date(d.data.last_sent_at).toLocaleString()}
                  </p>
                )}
              </div>
              {canEdit && (
                <RowActions
                  active={!!d.data.is_active}
                  onToggle={() => put(d.recordId, { is_active: d.data.is_active ? 0 : 1 })}
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
            </li>
          ))}
        </ul>
      )}

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
                className="h-8 text-[13px]"
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
                  className="h-8 font-mono text-[13px]"
                  value={editing.time}
                  onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                  placeholder="09:00"
                />
              </div>
              <div>
                <FieldLabel>Timezone</FieldLabel>
                <Input
                  className="h-8 font-mono text-[13px]"
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
              <Button size="sm" variant="secondary" className="h-8 text-[13px]" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-[13px]"
                data-testid="save-digest"
                onClick={save}
                disabled={!editing.email.trim()}
              >
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
      />
    </Section>
  )
}
