/**
 * Alerts — outbound delivery config: alert rules (Slack/webhook routing),
 * webhook endpoints (admin-only), and email digests.
 */

import { useState } from 'react'
import { useQuery, useMutations, useUser } from 'deepspace'
import { Badge, Button, Input, Modal, ConfirmModal, EmptyState, useToast } from '@/components/ui'
import type { AlertRule, AlertRuleMatch, Digest, Sentiment, WebhookEndpoint } from '../../types'

const SOURCES = ['hackernews', 'reddit', 'bluesky', 'youtube', 'github', 'news', 'web', 'x', 'linkedin']
const SENTIMENTS: Sentiment[] = ['positive', 'negative', 'neutral']
const RELEVANCES = ['low', 'medium', 'high'] as const

export default function AlertsPage() {
  const { user } = useUser()
  const isAdmin = user?.role === 'admin'

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-12 px-6 py-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Delivery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Route scored mentions to Slack, webhooks, and email digests.
          </p>
        </div>
        <RulesSection />
        {isAdmin && <WebhooksSection />}
        <DigestsSection />
      </div>
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
        <span className="w-20 text-xs text-muted-foreground">Sources</span>
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
        <span className="w-20 text-xs text-muted-foreground">Sentiment</span>
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
        <span className="w-20 text-xs text-muted-foreground">Min relevance</span>
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
      <p className="text-xs text-muted-foreground">Empty groups match everything.</p>
    </div>
  )
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
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

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Alert rules</h2>
        {canEdit && (
          <Button
            size="sm"
            data-testid="add-rule"
            onClick={() =>
              setEditing({ recordId: null, name: '', channel: 'slack', channelId: '', endpointId: '', match: {} })
            }
          >
            Add rule
          </Button>
        )}
      </div>

      {(rules ?? []).length === 0 && (
        <EmptyState title="No rules yet" description='e.g. "negative sentiment → Slack #alerts"' />
      )}

      <ul className="space-y-2">
        {(rules ?? []).map((r) => (
          <li
            key={r.recordId}
            data-testid="rule-row"
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.data.name}</span>
                <Badge variant="outline">{r.data.channel}</Badge>
                {!r.data.is_active && <Badge variant="secondary">off</Badge>}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{describeMatch(r.data.match)}</p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => put(r.recordId, { is_active: r.data.is_active ? 0 : 1 })}
                >
                  {r.data.is_active ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setEditing({
                      recordId: r.recordId,
                      name: r.data.name,
                      channel: r.data.channel === 'webhook' ? 'webhook' : 'slack',
                      channelId: r.data.target?.channelId ?? '',
                      endpointId: r.data.target?.endpointId ?? '',
                      match: r.data.match ?? {},
                    })
                  }
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(r.recordId)}>
                  Delete
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <Modal.Header onClose={() => setEditing(null)}>
          <Modal.Title>{editing?.recordId ? 'Edit rule' : 'Add rule'}</Modal.Title>
        </Modal.Header>
        {editing && (
          <Modal.Body className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input
                data-testid="rule-name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Negative sentiment → #alerts"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Channel</label>
              <div className="flex gap-2">
                {(['slack', 'webhook'] as const).map((ch) => (
                  <Button
                    key={ch}
                    type="button"
                    size="sm"
                    variant={editing.channel === ch ? 'default' : 'secondary'}
                    onClick={() => setEditing({ ...editing, channel: ch })}
                  >
                    {ch}
                  </Button>
                ))}
              </div>
            </div>
            {editing.channel === 'slack' ? (
              <div>
                <label className="mb-1 block text-sm font-medium">Slack channel ID</label>
                <Input
                  value={editing.channelId}
                  onChange={(e) => setEditing({ ...editing, channelId: e.target.value })}
                  placeholder="C0123456789"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium">Webhook endpoint</label>
                <div className="flex flex-wrap gap-2">
                  {(endpoints ?? []).map((ep) => (
                    <ToggleChip
                      key={ep.recordId}
                      active={editing.endpointId === ep.recordId}
                      label={ep.data.label || ep.data.url}
                      onClick={() => setEditing({ ...editing, endpointId: ep.recordId })}
                    />
                  ))}
                  {(endpoints ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No endpoints — an admin can add one below.
                    </p>
                  )}
                </div>
              </div>
            )}
            <MatchEditor match={editing.match} onChange={(m) => setEditing({ ...editing, match: m })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button data-testid="save-rule" onClick={save} disabled={!editing.name.trim()}>
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
    </section>
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
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Webhook endpoints</h2>
          <p className="text-xs text-muted-foreground">
            Deliveries are HMAC-signed (X-Octolens-Signature). Discord-compatible.
          </p>
        </div>
        <Button
          size="sm"
          data-testid="add-endpoint"
          onClick={() =>
            setEditing({ recordId: null, label: '', url: '', secret: newSecret(), filters: {} })
          }
        >
          Add endpoint
        </Button>
      </div>

      {(endpoints ?? []).length === 0 && (
        <EmptyState title="No endpoints" description="POST scored mentions anywhere — Zapier, Discord, your backend." />
      )}

      <ul className="space-y-2">
        {(endpoints ?? []).map((ep) => (
          <li
            key={ep.recordId}
            data-testid="endpoint-row"
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{ep.data.label || 'endpoint'}</span>
                {!ep.data.is_active && <Badge variant="secondary">off</Badge>}
                {(ep.data.failure_count ?? 0) > 0 && (
                  <Badge variant="destructive">{ep.data.failure_count} failures</Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{ep.data.url}</p>
              {ep.data.last_delivery_at && (
                <p className="text-xs text-muted-foreground">
                  last delivery {new Date(ep.data.last_delivery_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => put(ep.recordId, { is_active: ep.data.is_active ? 0 : 1 })}
              >
                {ep.data.is_active ? 'Pause' : 'Resume'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setEditing({
                    recordId: ep.recordId,
                    label: ep.data.label ?? '',
                    url: ep.data.url,
                    secret: ep.data.secret ?? '',
                    filters: ep.data.filters ?? {},
                  })
                }
              >
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeleting(ep.recordId)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <Modal.Header onClose={() => setEditing(null)}>
          <Modal.Title>{editing?.recordId ? 'Edit endpoint' : 'Add endpoint'}</Modal.Title>
        </Modal.Header>
        {editing && (
          <Modal.Body className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Label</label>
              <Input
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                placeholder="Zapier"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">URL</label>
              <Input
                data-testid="endpoint-url"
                value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://example.com/webhooks/octolens"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Signing secret</label>
              <div className="flex gap-2">
                <Input value={editing.secret} readOnly className="font-mono text-xs" />
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
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button data-testid="save-endpoint" onClick={save} disabled={!editing.url.trim()}>
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

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Email digests</h2>
        {canEdit && (
          <Button
            size="sm"
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

      {(digests ?? []).length === 0 && (
        <EmptyState title="No digests" description="A daily or weekly summary of matching mentions, in your inbox." />
      )}

      <ul className="space-y-2">
        {(digests ?? []).map((d) => (
          <li
            key={d.recordId}
            data-testid="digest-row"
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{d.data.target?.email}</span>
                <Badge variant="outline">
                  {d.data.schedule} at {d.data.time} ({d.data.timezone})
                </Badge>
                {!d.data.is_active && <Badge variant="secondary">off</Badge>}
              </div>
              {d.data.last_sent_at && (
                <p className="text-xs text-muted-foreground">
                  last sent {new Date(d.data.last_sent_at).toLocaleString()}
                </p>
              )}
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => put(d.recordId, { is_active: d.data.is_active ? 0 : 1 })}
                >
                  {d.data.is_active ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setEditing({
                      recordId: d.recordId,
                      schedule: d.data.schedule,
                      time: d.data.time ?? '09:00',
                      timezone: d.data.timezone ?? 'UTC',
                      email: d.data.target?.email ?? '',
                      filters: d.data.filters ?? {},
                    })
                  }
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(d.recordId)}>
                  Delete
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <Modal.Header onClose={() => setEditing(null)}>
          <Modal.Title>{editing?.recordId ? 'Edit digest' : 'Add digest'}</Modal.Title>
        </Modal.Header>
        {editing && (
          <Modal.Body className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <Input
                data-testid="digest-email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="team@company.com"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Schedule</label>
              <div className="flex gap-2">
                {(['daily', 'weekly'] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={editing.schedule === s ? 'default' : 'secondary'}
                    onClick={() => setEditing({ ...editing, schedule: s })}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Time (HH:MM)</label>
                <Input
                  value={editing.time}
                  onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                  placeholder="09:00"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Timezone</label>
                <Input
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
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button data-testid="save-digest" onClick={save} disabled={!editing.email.trim()}>
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
    </section>
  )
}
