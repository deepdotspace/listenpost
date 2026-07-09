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
                  'flex flex-col rounded-[14px] bg-card p-[22px] transition-colors',
                  highlighted
                    ? 'border-[1.5px] border-primary/25 shadow-[0_10px_30px_-14px_rgba(79,70,229,0.33)]'
                    : 'border border-border hover:border-input',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-bold text-foreground">{plan.name}</p>
                  {highlighted && (
                    <span className="rounded-md border border-primary/25 bg-primary/[0.08] px-[7px] py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-primary">
                      Recommended
                    </span>
                  )}
                </div>

                <p className="mt-3.5 flex items-baseline gap-[5px]">
                  <span className="text-[36px] font-bold tracking-[-0.03em] tabular-nums text-foreground">
                    ${Math.round(plan.priceCents / 100)}
                  </span>
                  <span className="text-[12px] text-tertiary">/ month</span>
                </p>

                <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
                  {blurb}
                </p>

                <ul className="mt-4 space-y-2 border-t border-border pt-4 text-[13px] text-muted-foreground">
                  <li>
                    <span className="font-semibold tabular-nums text-foreground">
                      {PLAN_QUOTAS[slug].toLocaleString()}
                    </span>{' '}
                    mentions / month
                  </li>
                  <li>
                    {OVERAGE_PER_MENTION_CENTS[slug] > 0 ? (
                      <>
                        then{' '}
                        <span className="font-semibold tabular-nums text-foreground">
                          ${(OVERAGE_PER_MENTION_CENTS[slug] / 100).toFixed(3)}
                        </span>{' '}
                        per extra mention
                      </>
                    ) : (
                      'hard cap — upgrade to keep ingesting'
                    )}
                  </li>
                </ul>

                <div className="mt-5 flex flex-1 items-end">
                  {isCurrent ? (
                    <span className="inline-flex h-[38px] w-full items-center justify-center rounded-[9px] border border-input text-[13px] font-medium text-muted-foreground">
                      Current plan
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectPlan(slug)}
                      className={cn(
                        'inline-flex h-[38px] w-full items-center justify-center rounded-[9px] text-[13px] font-semibold transition-colors',
                        highlighted
                          ? 'bg-primary text-primary-foreground hover:brightness-110'
                          : 'border border-input text-foreground hover:bg-secondary',
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
