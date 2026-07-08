import type { CollectionSchema } from 'deepspace/worker'

/**
 * Outbound webhook endpoints. `secret` signs deliveries (HMAC-SHA256) so
 * receivers can verify authenticity — admin-only read keeps it off the
 * WebSocket sync for lower roles.
 */
export const webhookEndpointsSchema: CollectionSchema = {
  name: 'webhook_endpoints',
  columns: [
    { name: 'label', storage: 'text', interpretation: 'plain' },
    { name: 'url', storage: 'text', interpretation: { kind: 'url' }, required: true },
    { name: 'secret', storage: 'text', interpretation: 'plain' },
    // { sources?, sentiment?, relevance_min?, keyword_ids?, tags? } — same shape as alert_rules.match
    { name: 'filters', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'last_delivery_at', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'failure_count', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'is_active', storage: 'number', interpretation: { kind: 'boolean' }, default: 1 },
  ],
  permissions: {
    // Secrets stay server/admin-side only.
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
