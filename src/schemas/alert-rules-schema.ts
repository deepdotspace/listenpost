import type { CollectionSchema } from 'deepspace/worker'

/**
 * Alert rules — routing. When a scored mention matches `match`, a delivery
 * job sends it to `channel`/`target` (Slack channel, email, webhook endpoint).
 *
 * `match` json shape: { sources?: string[], sentiment?: string[],
 *   relevance_min?: 'low'|'medium'|'high', keyword_ids?: string[], tags?: string[] }
 * `target` json shape: channel-specific — { channelId } | { email } | { endpointId }
 */
export const alertRulesSchema: CollectionSchema = {
  name: 'alert_rules',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'match', storage: 'text', interpretation: { kind: 'json' } },
    {
      name: 'channel',
      storage: 'text',
      interpretation: { kind: 'select', options: ['slack', 'email', 'webhook'] },
      required: true,
    },
    { name: 'target', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'is_active', storage: 'number', interpretation: { kind: 'boolean' }, default: 1 },
    { name: 'created_by_user', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  ownerField: 'created_by_user',
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
