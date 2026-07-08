import type { CollectionSchema } from 'deepspace/worker'

/**
 * Keywords — the monitors. Each row is a term the app crawls sources for,
 * with per-keyword brand context that tunes the AI relevance scorer.
 */
export const keywordsSchema: CollectionSchema = {
  name: 'keywords',
  columns: [
    { name: 'term', storage: 'text', interpretation: 'plain', required: true },
    {
      name: 'keyword_type',
      storage: 'text',
      interpretation: { kind: 'select', options: ['brand', 'feature', 'competitor', 'pain_point'] },
      default: 'brand',
    },
    { name: 'brand_context', storage: 'text', interpretation: 'plain' },
    // Enabled source ids, e.g. ["hackernews","reddit"]
    { name: 'sources', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'is_active', storage: 'number', interpretation: { kind: 'boolean' }, default: 1 },
    // Ownership column — overwritten with the verified caller id on create.
    { name: 'created_by_user', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  ownerField: 'created_by_user',
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
