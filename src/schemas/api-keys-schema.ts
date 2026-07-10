import type { CollectionSchema } from 'deepspace/worker'

/**
 * API keys for the data-layer REST API. The raw key is shown ONCE at
 * generation time (server action) and only its SHA-256 hash is stored.
 * Creation goes through a server action so hashing never happens client-side.
 */
export const apiKeysSchema: CollectionSchema = {
  name: 'api_keys',
  columns: [
    { name: 'label', storage: 'text', interpretation: 'plain', required: true },
    // SHA-256 hex of the raw key. Never store or log the raw key.
    { name: 'key_hash', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    // First characters of the key, for display (e.g. "olk_a1b2…").
    { name: 'prefix', storage: 'text', interpretation: 'plain', immutable: true },
    { name: 'scopes', storage: 'text', interpretation: { kind: 'json' } },
    // Tenant this key reads from. Keys live in the APP room (one place to
    // resolve a Bearer hash); the API then queries `ws:<workspace_id>`.
    { name: 'workspace_id', storage: 'text', interpretation: 'plain', immutable: true },
    { name: 'last_used_at', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'is_active', storage: 'number', interpretation: { kind: 'boolean' }, default: 1 },
    { name: 'created_by_user', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  ownerField: 'created_by_user',
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    // Rows are created by the generate-api-key server action (bypasses RBAC).
    // Owners can see and revoke (delete) their keys, not edit them.
    member: { read: 'own', create: false, update: false, delete: 'own' },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
