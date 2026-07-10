import { describe, it, expect } from 'vitest'
import {
  quotaForTier,
  keywordCapForTier,
  PLAN_QUOTAS,
  PLAN_KEYWORD_CAPS,
} from '../../src/subscriptions'
import { keywordsWithinCap, type KeywordEnvelope } from '../../src/ingestion'

describe('quotaForTier', () => {
  it('maps plan slugs to quotas', () => {
    expect(quotaForTier('free')).toEqual({ quota: 1_000, hardCap: true })
    expect(quotaForTier('pro')).toEqual({ quota: 15_000, hardCap: false })
    expect(quotaForTier('scale')).toEqual({ quota: 50_000, hardCap: false })
  })

  it('unknown or missing tiers fall back to the free hard cap', () => {
    expect(quotaForTier(undefined)).toEqual({ quota: PLAN_QUOTAS.free, hardCap: true })
    expect(quotaForTier('enterprise-nonsense')).toEqual({ quota: PLAN_QUOTAS.free, hardCap: true })
  })
})

describe('keywordCapForTier', () => {
  it('maps plan slugs to active-keyword caps', () => {
    expect(keywordCapForTier('free')).toBe(PLAN_KEYWORD_CAPS.free)
    expect(keywordCapForTier('pro')).toBe(PLAN_KEYWORD_CAPS.pro)
    expect(keywordCapForTier('scale')).toBe(PLAN_KEYWORD_CAPS.scale)
  })

  it('unknown or missing tiers fall back to the free cap', () => {
    expect(keywordCapForTier(undefined)).toBe(PLAN_KEYWORD_CAPS.free)
    expect(keywordCapForTier('enterprise-nonsense')).toBe(PLAN_KEYWORD_CAPS.free)
  })
})

describe('keywordsWithinCap', () => {
  const kw = (id: string, createdAt: string): KeywordEnvelope => ({
    recordId: id,
    createdBy: 'u',
    createdAt,
    data: { term: id, is_active: 1 },
  })

  it('keeps the oldest keywords, deterministically', () => {
    const list = [
      kw('c', '2026-03-01T00:00:00Z'),
      kw('a', '2026-01-01T00:00:00Z'),
      kw('b', '2026-02-01T00:00:00Z'),
    ]
    expect(keywordsWithinCap(list, 2).map((k) => k.recordId)).toEqual(['a', 'b'])
    // Input order must not matter.
    expect(keywordsWithinCap([...list].reverse(), 2).map((k) => k.recordId)).toEqual(['a', 'b'])
  })

  it('returns everything when under the cap', () => {
    const list = [kw('a', '2026-01-01T00:00:00Z')]
    expect(keywordsWithinCap(list, 5)).toHaveLength(1)
  })
})
