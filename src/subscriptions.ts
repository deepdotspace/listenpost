/**
 * Subscription plan declarations — priced at cost + ~25-30% margin.
 *
 * Cost model (per month): AI scoring ≈ $0.002/mention (haiku via the
 * anthropic/chat-completion integration, ~650 tokens blended @ $3/MTok),
 * plus paid-source polling per keyword (github $3.60, youtube $7.20,
 * news $12.96, x/linkedin $3 each, exa ~$0.60 at current cadences).
 * Pro assumes ~5 keywords / ~2 paid sources each (~$60 cost); Scale ~15
 * keywords (~$190 cost).
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
    priceCents: 7900, // $79/month ≈ $60 cost + ~30%
    taxCode: 'txcd_10000000',
  },
  {
    slug: 'scale',
    name: 'Scale',
    priceCents: 23900, // $239/month ≈ $190 cost + ~25%
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

/** Overage price per mention beyond quota, in cents (fractional allowed).
 * Marginal cost of an extra mention is scoring only (~0.2¢) — price at
 * cost + ~25-50% depending on tier. */
export const OVERAGE_PER_MENTION_CENTS: Record<SubscriptionPlanSlug, number> = {
  free: 0, // hard cap, no overage
  pro: 0.3, // $0.003
  scale: 0.25, // $0.0025
}

export function quotaForTier(tier: string | undefined): { quota: number; hardCap: boolean } {
  const slug = (tier ?? 'free') as SubscriptionPlanSlug
  if (!(slug in PLAN_QUOTAS)) return { quota: PLAN_QUOTAS.free, hardCap: true }
  return { quota: PLAN_QUOTAS[slug], hardCap: slug === 'free' }
}
