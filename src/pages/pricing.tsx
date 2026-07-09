/**
 * Pricing — public page. Plans mirror Octolens: Trial (5k mentions/mo),
 * Pro $159 (15k), Scale $499 (50k), with per-mention overage on paid tiers.
 */

import { PricingTable, useSubscription, useAuth } from 'deepspace'
import { PLAN_QUOTAS, OVERAGE_PER_MENTION_CENTS, type SubscriptionPlanSlug } from '../subscriptions'

const PLAN_DETAILS: { slug: SubscriptionPlanSlug; blurb: string }[] = [
  { slug: 'free', blurb: 'Kick the tires on a real feed.' },
  { slug: 'pro', blurb: 'For teams monitoring a brand seriously.' },
  { slug: 'scale', blurb: 'High-volume brands and agencies.' },
]

export default function PricingPage() {
  const sub = useSubscription()
  const { isSignedIn } = useAuth()

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">Pricing</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Every plan includes the full data layer — dashboard, API, webhooks,
            Slack routing, and email digests. Plans differ only in monthly
            mention volume.
          </p>
        </div>

        <div className="mt-10" data-testid="pricing-table">
          {sub.isLoading ? (
            <p className="text-center text-muted-foreground">Loading plans…</p>
          ) : (
            <PricingTable
              plans={sub.plans}
              currentTier={sub.tier}
              onSelect={(slug) => {
                if (!isSignedIn) {
                  window.location.href = '/mentions' // AuthGate will prompt sign-in
                  return
                }
                void sub.subscribe(slug)
              }}
            />
          )}
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3" data-testid="quota-details">
          {PLAN_DETAILS.map(({ slug, blurb }) => (
            <div key={slug} className="rounded-lg border border-border bg-card p-4 text-sm">
              <p className="font-semibold capitalize">{slug === 'free' ? 'Trial' : slug}</p>
              <p className="mt-1 text-muted-foreground">{blurb}</p>
              <ul className="mt-3 space-y-1 text-muted-foreground">
                <li>
                  <span className="text-foreground">{PLAN_QUOTAS[slug].toLocaleString()}</span>{' '}
                  mentions / month
                </li>
                <li>
                  {OVERAGE_PER_MENTION_CENTS[slug] > 0 ? (
                    <>
                      then{' '}
                      <span className="text-foreground">
                        ${(OVERAGE_PER_MENTION_CENTS[slug] / 100).toFixed(3)}
                      </span>{' '}
                      per extra mention
                    </>
                  ) : (
                    'hard cap — upgrade to keep ingesting'
                  )}
                </li>
              </ul>
            </div>
          ))}
        </div>

        {isSignedIn && sub.entitled && sub.tier !== 'free' && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => void sub.openPortal()}
              className="text-sm text-primary hover:underline"
            >
              Manage billing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
