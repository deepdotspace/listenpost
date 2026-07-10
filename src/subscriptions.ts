/**
 * Subscription plan declarations — mirrors Listenpost's pricing.
 *
 * Edit this file then `deepspace deploy` to sync the plans to Stripe Products
 * and Prices. Keep `slug` stable — subscribers and tier checks refer to it.
 */

export const subscriptionPlans = [
  {
    slug: 'free',
    name: 'Trial',
    priceCents: 0,
  },
  {
    slug: 'pro',
    name: 'Pro',
    priceCents: 15900, // $159/month
    taxCode: 'txcd_10000000',
  },
  {
    slug: 'scale',
    name: 'Scale',
    priceCents: 49900, // $499/month
    taxCode: 'txcd_10000000',
  },
] as const

export type SubscriptionPlanSlug = (typeof subscriptionPlans)[number]['slug']

/** Monthly mention quota per plan. Free is a hard cap; paid plans meter
 * overage per mention beyond quota. */
export const PLAN_QUOTAS: Record<SubscriptionPlanSlug, number> = {
  free: 5_000,
  pro: 15_000,
  scale: 50_000,
}

/** Overage price per mention beyond quota, in cents (fractional allowed). */
export const OVERAGE_PER_MENTION_CENTS: Record<SubscriptionPlanSlug, number> = {
  free: 0, // hard cap, no overage
  pro: 1.3, // $0.013
  scale: 1.0, // $0.01
}

export function quotaForTier(tier: string | undefined): { quota: number; hardCap: boolean } {
  const slug = (tier ?? 'free') as SubscriptionPlanSlug
  if (!(slug in PLAN_QUOTAS)) return { quota: PLAN_QUOTAS.free, hardCap: true }
  return { quota: PLAN_QUOTAS[slug], hardCap: slug === 'free' }
}
