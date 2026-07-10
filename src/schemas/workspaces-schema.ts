import type { CollectionSchema } from 'deepspace/worker'

/**
 * Workspaces — the tenancy registry. Lives in the APP room; each workspace's
 * actual data (keywords, mentions, rules, …) lives in its own RecordRoom DO
 * at roomId `ws:<workspaceRecordId>`.
 *
 * Membership is the tenant security boundary: the worker's /ws/:roomId route
 * refuses connections to `ws:*` rooms unless the JWT subject is the owner or
 * in `member_ids` (see worker.ts). Read here uses 'shared' + collaboratorsField
 * so users only sync workspaces they belong to.
 */
export const workspacesSchema: CollectionSchema = {
  name: 'workspaces',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    // Default brand context copied into the first keyword at onboarding.
    { name: 'brand_context', storage: 'text', interpretation: 'plain' },
    { name: 'owner_user', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    // JSON array of member userIds (owner included for simple lookups).
    { name: 'member_ids', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'is_active', storage: 'number', interpretation: { kind: 'boolean' }, default: 1 },
  ],
  ownerField: 'owner_user',
  collaboratorsField: 'member_ids',
  permissions: {
    viewer: { read: 'shared', create: false, update: false, delete: false },
    // Any member can create their own workspace; only the owner edits/deletes it.
    member: { read: 'shared', create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
