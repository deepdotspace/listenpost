/**
 * Ingestion pipeline — runs from the poll-sources cron task.
 *
 * For each active keyword × enabled source:
 *   1. load the (source, keyword) cursor from sources_state
 *   2. fetch new items from the source
 *   3. insert mentions (dedupe: query by (source, source_id); the schema's
 *      uniqueOn constraint is the safety net)
 *   4. persist the cursor
 *   5. enqueue an AI scoring job per inserted mention
 */

import { enqueueJob } from 'deepspace/worker'
import type { CronContext, IngestEnv } from './context'
import type { SourceFetcher } from './types'
import { buildQuotaMap, consumeQuota, type QuotaState } from './quota'
import { hackernewsFetcher } from './hackernews'
import { redditFetcher } from './reddit'
import { blueskyFetcher } from './bluesky'
import { youtubeFetcher } from './youtube'
import { githubFetcher } from './github'
import { newsFetcher } from './news'
import { webFetcher } from './web'
import { xFetcher, linkedinFetcher } from './social-search'

/** All registered fetchers. */
export const FETCHERS: SourceFetcher[] = [
  hackernewsFetcher,
  redditFetcher,
  blueskyFetcher,
  youtubeFetcher,
  githubFetcher,
  newsFetcher,
  webFetcher,
  xFetcher,
  linkedinFetcher,
]

/** Hard cap per (keyword, source) per poll — keeps first polls bounded. */
const MAX_INSERTS_PER_POLL = 50

interface KeywordEnvelope {
  recordId: string
  createdBy: string
  data: {
    term: string
    keyword_type?: 'brand' | 'feature' | 'competitor' | 'pain_point'
    is_active?: number
    sources?: string[]
    brand_context?: string
  }
}

/** The tenant a sweep runs for — quota bills the workspace owner. */
export interface IngestTenant {
  workspaceId: string
  ownerId: string
}

export async function runIngestion(
  ctx: CronContext,
  env: IngestEnv,
  tenant: IngestTenant,
): Promise<void> {
  const keywords = (await ctx.records.query('keywords', {
    where: { is_active: 1 },
  })) as KeywordEnvelope[]
  if (keywords.length === 0) return

  // Monthly quota, keyed by the workspace owner, once per sweep.
  const quotas = await buildQuotaMap(ctx, env, [tenant.ownerId])
  const quota = quotas.get(tenant.ownerId)

  for (const keyword of keywords) {
    const enabled = keyword.data.sources ?? []
    for (const fetcher of FETCHERS) {
      if (!enabled.includes(fetcher.id)) continue
      try {
        await pollSourceForKeyword(ctx, env, fetcher, keyword, tenant, quota)
      } catch (err) {
        // One bad source/keyword must not stall the whole sweep.
        console.error(`[ingest] ${fetcher.id} × "${keyword.data.term}" failed:`, err)
      }
    }
  }
}

async function pollSourceForKeyword(
  ctx: CronContext,
  env: IngestEnv,
  fetcher: SourceFetcher,
  keyword: KeywordEnvelope,
  tenant: IngestTenant,
  quota: QuotaState | undefined,
): Promise<void> {
  const [stateRow] = await ctx.records.query('sources_state', {
    where: { source: fetcher.id, keyword_id: keyword.recordId },
    limit: 1,
  })
  const cursor: string | undefined = stateRow?.data?.last_seen_id || undefined

  // Paid integrations poll on their own slower cadence.
  if (fetcher.minIntervalMinutes && stateRow?.data?.last_polled_at) {
    const elapsedMs = Date.now() - new Date(stateRow.data.last_polled_at).getTime()
    if (elapsedMs < fetcher.minIntervalMinutes * 60_000) return
  }

  const { items, nextCursor } = await fetcher.fetch(keyword.data.term, cursor, ctx)

  let inserted = 0
  for (const item of items) {
    if (inserted >= MAX_INSERTS_PER_POLL) break

    const existing = await ctx.records.query('mentions', {
      where: { source: item.source, source_id: item.source_id },
      limit: 1,
    })
    if (existing.length > 0) continue

    // Plan quota: free tier stops here; paid tiers continue and meter overage.
    if (!consumeQuota(env, tenant.ownerId, quota)) {
      console.log(`[ingest] quota hard-cap hit for owner ${tenant.ownerId} — skipping rest of poll`)
      break
    }

    let recordId: string | undefined
    try {
      const created = await ctx.records.create('mentions', {
        ...item,
        keyword_id: keyword.recordId,
        keyword_ids: [keyword.recordId],
        fetched_at: new Date().toISOString(),
        relevance: 'pending',
        relevance_score: 0,
        sentiment: 'pending',
        status: 'new',
        tags: [],
      })
      recordId = created?.recordId
      inserted++
    } catch {
      // uniqueOn(source, source_id) race — another keyword's sweep won.
      continue
    }

    if (recordId) {
      await enqueueJob(
        env.JOB_ROOMS,
        `app:${env.APP_NAME}`,
        'score-mention',
        {
          mentionId: recordId,
          workspaceId: tenant.workspaceId,
          mention: { ...item, keyword_id: keyword.recordId },
          keyword: {
            term: keyword.data.term,
            keyword_type: keyword.data.keyword_type,
            brand_context: keyword.data.brand_context,
          },
        },
        { maxAttempts: 3 },
      )
    }
  }

  const now = new Date().toISOString()
  if (stateRow) {
    await ctx.records.update('sources_state', stateRow.recordId, {
      last_seen_id: nextCursor ?? cursor ?? '',
      last_polled_at: now,
    })
  } else {
    await ctx.records.create('sources_state', {
      source: fetcher.id,
      keyword_id: keyword.recordId,
      last_seen_id: nextCursor ?? '',
      last_polled_at: now,
    })
  }

  if (inserted > 0) {
    console.log(`[ingest] ${fetcher.id} × "${keyword.data.term}": +${inserted} mentions`)
  }
}
