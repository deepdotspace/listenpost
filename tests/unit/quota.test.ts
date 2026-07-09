import { describe, it, expect } from 'vitest'
import { quotaForTier, PLAN_QUOTAS } from '../../src/subscriptions'

describe('quotaForTier', () => {
  it('maps plan slugs to quotas', () => {
    expect(quotaForTier('free')).toEqual({ quota: 5_000, hardCap: true })
    expect(quotaForTier('pro')).toEqual({ quota: 15_000, hardCap: false })
    expect(quotaForTier('scale')).toEqual({ quota: 50_000, hardCap: false })
  })

  it('unknown or missing tiers fall back to the free hard cap', () => {
    expect(quotaForTier(undefined)).toEqual({ quota: PLAN_QUOTAS.free, hardCap: true })
    expect(quotaForTier('enterprise-nonsense')).toEqual({ quota: PLAN_QUOTAS.free, hardCap: true })
  })
})
