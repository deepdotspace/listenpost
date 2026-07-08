import type { CollectionSchema } from 'deepspace/worker'

/** Source ids a mention can come from. Shared by cron ingestion and the UI. */
export const MENTION_SOURCES = [
  'hackernews',
  'reddit',
  'youtube',
  'github',
  'news',
  'podcast',
  'web',
  'bluesky',
  'stackoverflow',
  'devto',
  'producthunt',
  'x',
  'linkedin',
] as const

export type MentionSource = (typeof MENTION_SOURCES)[number]

export const RELEVANCE_LEVELS = ['pending', 'low', 'medium', 'high'] as const
export const SENTIMENTS = ['pending', 'positive', 'negative', 'neutral'] as const
export const MENTION_STATUSES = ['new', 'assigned', 'resolved', 'ignored'] as const

/**
 * Mentions — the core object. Rows are created ONLY by server-side
 * ingestion (cron/jobs via the X-App-Action path, which bypasses RBAC),
 * then AI-scored by a job, then triaged by the team in the dashboard.
 */
export const mentionsSchema: CollectionSchema = {
  name: 'mentions',
  columns: [
    { name: 'source', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    // Native id at the source — dedupe key together with `source`.
    { name: 'source_id', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'keyword_id', storage: 'text', interpretation: 'plain' },
    // All matched keyword record ids (multi-match).
    { name: 'keyword_ids', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'author', storage: 'text', interpretation: 'plain' },
    { name: 'author_url', storage: 'text', interpretation: { kind: 'url' } },
    { name: 'url', storage: 'text', interpretation: { kind: 'url' } },
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'body', storage: 'text', interpretation: 'plain' },
    { name: 'published_at', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'fetched_at', storage: 'text', interpretation: { kind: 'datetime' } },
    {
      name: 'relevance',
      storage: 'text',
      interpretation: { kind: 'select', options: [...RELEVANCE_LEVELS] },
      default: 'pending',
    },
    { name: 'relevance_score', storage: 'number', interpretation: 'plain', default: 0 },
    {
      name: 'sentiment',
      storage: 'text',
      interpretation: { kind: 'select', options: [...SENTIMENTS] },
      default: 'pending',
    },
    { name: 'tags', storage: 'text', interpretation: { kind: 'json' } },
    // Source-specific engagement metrics (points, comments, likes, …).
    { name: 'engagement', storage: 'text', interpretation: { kind: 'json' } },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: [...MENTION_STATUSES] },
      default: 'new',
    },
    // userId of the assignee — set by triagers, so intentionally NOT userBound.
    { name: 'assigned_to', storage: 'text', interpretation: 'plain' },
    { name: 'notes', storage: 'text', interpretation: 'plain' },
  ],
  // DB-level dedupe safety net; ingestion also checks before insert.
  uniqueOn: ['source', 'source_id'],
  permissions: {
    // Whole team sees the live feed; only server-side ingestion creates rows.
    viewer: { read: true, create: false, update: false, delete: false },
    member: {
      read: true,
      create: false,
      update: true,
      delete: false,
      // Members triage — they can't rewrite ingested content or AI scores.
      writableFields: ['status', 'assigned_to', 'tags', 'notes'],
    },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
