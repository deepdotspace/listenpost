/**
 * Per-customer mention quota — resolved from the keyword owner's
 * subscription tier. Free tier hard-caps; paid tiers keep ingesting and
 * meter overage per mention (Listenpost: $0.013 Pro / $0.01 Scale).
 */

import { apiWorkerFetch, meterUsage } from 'deepspace/worker'
import { quotaForTier, OVERAGE_PER_MENTION_CENTS, type SubscriptionPlanSlug } from '../subscriptions'
import type { CronContext, IngestEnv } from './context'

export interface QuotaState {
  tier: string
  quota: number
  hardCap: boolean
  /** Mentions already ingested this calendar month for this owner. */
  used: number
}

/** Owner userId → quota state, computed once per cron sweep. */
export async function buildQuotaMap(
  ctx: CronContext,
  env: IngestEnv,
  ownerIds: string[],
): Promise<Map<string, QuotaState>> {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  // Tenancy: `ctx` is a WORKSPACE room, so every mention in it belongs to
  // this tenant — usage is simply the month's row count. (The old
  // per-keyword-creator mapping under-counted when a member, not the
  // owner, created the keyword.) Soft count over the newest 1000 rows;
  // beyond that the cap has long since tripped anyway.
  const recent = (await ctx.records.query('mentions', { limit: 1000 })) as Array<{
    createdAt: string
  }>
  const usedThisMonth = recent.filter(
    (m) => new Date(m.createdAt).getTime() >= monthStart.getTime(),
  ).length

  const map = new Map<string, QuotaState>()
  for (const ownerId of new Set(ownerIds)) {
    const tier = await resolveTier(env, ownerId)
    const { quota, hardCap } = quotaForTier(tier)
    map.set(ownerId, { tier, quota, hardCap, used: usedThisMonth })
  }
  return map
}

/**
 * Account for one would-be insert. Returns false when the insert must be
 * skipped (free tier over quota); true otherwise, metering overage when
 * the owner is past quota on a paid tier.
 */
export function consumeQuota(env: IngestEnv, ownerId: string, state: QuotaState | undefined): boolean {
  if (!state) return true // unknown owner — never block ingestion on bookkeeping
  if (state.used < state.quota) {
    state.used++
    return true
  }
  if (state.hardCap) return false
  state.used++
  const cents = OVERAGE_PER_MENTION_CENTS[state.tier as SubscriptionPlanSlug] ?? 0
  // AnalyticsEngine metering never breaks the ingest path (returns false when absent).
  void meterUsage(env as never, 'mention-overage', { id: ownerId, units: cents, count: 1 })
  return true
}

/** Look up a user's subscription tier via the api-worker (app-identified). */
async function resolveTier(env: IngestEnv, userId: string): Promise<string> {
  const e = env as IngestEnv & { APP_IDENTITY_TOKEN?: string }
  if (!e.APP_IDENTITY_TOKEN) return 'free' // pre-deploy local dev
  try {
    const res = await apiWorkerFetch(e, '/api/subscriptions/me', {
      headers: {
        'x-app-identity-token': e.APP_IDENTITY_TOKEN,
        'x-app-name': e.APP_NAME,
        'x-user-id': userId,
      },
    })
    if (!res.ok) return 'free'
    const json = (await res.json()) as { tier?: string; entitled?: boolean }
    return json.entitled && json.tier ? json.tier : 'free'
  } catch {
    return 'free'
  }
}
