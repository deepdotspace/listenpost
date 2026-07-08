import type { CollectionSchema } from 'deepspace/worker'

/**
 * Ingestion cursor state — one row per (source, keyword). Written only by
 * the cron ingester (server path); admins can read for debugging.
 */
export const sourcesStateSchema: CollectionSchema = {
  name: 'sources_state',
  columns: [
    { name: 'source', storage: 'text', interpretation: 'plain', required: true },
    { name: 'keyword_id', storage: 'text', interpretation: 'plain', required: true },
    // Newest source-native id/timestamp already ingested.
    { name: 'last_seen_id', storage: 'text', interpretation: 'plain' },
    { name: 'last_polled_at', storage: 'text', interpretation: { kind: 'datetime' } },
  ],
  uniqueOn: ['source', 'keyword_id'],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
