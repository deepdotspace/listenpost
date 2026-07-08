import type { CollectionSchema } from 'deepspace/worker'

/**
 * Email/Slack digests — scheduled summaries of matching mentions.
 * `filters` json: same match shape as alert_rules.match.
 * `target` json: { email } | { channelId }
 */
export const digestsSchema: CollectionSchema = {
  name: 'digests',
  columns: [
    {
      name: 'schedule',
      storage: 'text',
      interpretation: { kind: 'select', options: ['daily', 'weekly'] },
      required: true,
    },
    // "HH:MM" 24h wall-clock in `timezone`.
    { name: 'time', storage: 'text', interpretation: 'plain', default: '09:00' },
    { name: 'timezone', storage: 'text', interpretation: 'plain', default: 'UTC' },
    { name: 'filters', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'target', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'last_sent_at', storage: 'text', interpretation: { kind: 'datetime' } },
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
