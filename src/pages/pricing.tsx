/**
 * Pricing — public page. Plans mirror Octolens: Trial (5k mentions/mo),
 * Pro $159 (15k), Scale $499 (50k), with per-mention overage on paid tiers.
 * One card per plan: name, price, blurb, quota + overage, select button.
 */

import { useSubscription, useAuth } from 'deepspace'
import { cn } from '@/components/ui'
import { PageHeader } from '../components/PageHeader'
import {
  subscriptionPlans,
  PLAN_QUOTAS,
  OVERAGE_PER_MENTION_CENTS,
  type SubscriptionPlanSlug,
} from '../subscriptions'

const PLAN_DETAILS: { slug: SubscriptionPlanSlug; blurb: string }[] = [
  { slug: 'free', blurb: 'Kick the tires on a real feed.' },
  { slug: 'pro', blurb: 'For teams monitoring a brand seriously.' },
  { slug: 'scale', blurb: 'High-volume brands and agencies.' },
]

export default function PricingPage() {
  const sub = useSubscription()
  const { isSignedIn } = useAuth()

  function selectPlan(slug: SubscriptionPlanSlug) {
    if (!isSignedIn) {
      window.location.href = '/mentions' // AuthGate will prompt sign-in
      return
    }
    void sub.subscribe(slug)
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Pricing"
        meta={<span>Plans differ only in monthly mention volume</span>}
      />

      <div className="flex-1 px-4 py-4 sm:px-6" data-testid="pricing-table">
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          Every plan includes the full data layer — dashboard, API, webhooks, Slack
          routing, and email digests.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="quota-details">
          {PLAN_DETAILS.map(({ slug, blurb }) => {
            const plan = subscriptionPlans.find((p) => p.slug === slug)
            if (!plan) return null
            const highlighted = slug === 'pro'
            const isCurrent = isSignedIn && !sub.isLoading && sub.tier === slug
            return (
              <div
                key={slug}
                className={cn(
                  'flex flex-col rounded-lg border bg-card/50 p-4',
                  highlighted ? 'border-primary/40' : 'border-border',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                  {highlighted && (
                    <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                      Recommended
                    </span>
                  )}
                </div>

                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight text-foreground">
                    ${Math.round(plan.priceCents / 100)}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">/ month</span>
                </p>

                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {blurb}
                </p>

                <ul className="mt-3 space-y-1 border-t border-border pt-3 text-[13px] text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">
                      {PLAN_QUOTAS[slug].toLocaleString()}
                    </span>{' '}
                    mentions / month
                  </li>
                  <li>
                    {OVERAGE_PER_MENTION_CENTS[slug] > 0 ? (
                      <>
                        then{' '}
                        <span className="font-medium text-foreground">
                          ${(OVERAGE_PER_MENTION_CENTS[slug] / 100).toFixed(3)}
                        </span>{' '}
                        per extra mention
                      </>
                    ) : (
                      'hard cap — upgrade to keep ingesting'
                    )}
                  </li>
                </ul>

                <div className="mt-4 flex flex-1 items-end">
                  {isCurrent ? (
                    <span className="inline-flex h-8 w-full items-center justify-center rounded-md border border-border text-[13px] font-medium text-muted-foreground">
                      Current plan
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectPlan(slug)}
                      className={cn(
                        'inline-flex h-8 w-full items-center justify-center rounded-md text-[13px] font-medium transition-colors',
                        highlighted
                          ? 'bg-primary text-primary-foreground hover:opacity-90'
                          : 'border border-border text-foreground hover:bg-secondary',
                      )}
                    >
                      {slug === 'free' ? 'Start trial' : `Select ${plan.name}`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {isSignedIn && sub.entitled && sub.tier !== 'free' && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void sub.openPortal()}
              className="text-xs font-medium text-primary hover:underline"
            >
              Manage billing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
