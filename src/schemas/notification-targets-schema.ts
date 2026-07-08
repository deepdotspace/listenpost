import type { CollectionSchema } from 'deepspace/worker'

/**
 * Notification targets — reusable destinations (Slack channels, emails)
 * referenced by alert_rules and digests.
 * `config` json shape: { channelId, channelName } | { email }
 */
export const notificationTargetsSchema: CollectionSchema = {
  name: 'notification_targets',
  columns: [
    {
      name: 'type',
      storage: 'text',
      interpretation: { kind: 'select', options: ['slack_channel', 'email'] },
      required: true,
    },
    { name: 'label', storage: 'text', interpretation: 'plain', required: true },
    { name: 'config', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'is_active', storage: 'number', interpretation: { kind: 'boolean' }, default: 1 },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
