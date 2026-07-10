/**
 * Background-job handler — invoked by AppJobRoom (worker.ts) for every
 * job picked up from the queue. Dispatch on `job.type`; return a result
 * or throw to fail (retried up to `maxAttempts`).
 */

import type { Job, JobContext } from 'deepspace/worker'
import { buildCronContext, enqueueJob } from 'deepspace/worker'
import type { IngestEnv } from './ingestion/context'
import type { CronContext } from './ingestion/context'
import {
  keywordsWithinCap,
  purgeKeywordData,
  sweepKeyword,
  type KeywordEnvelope,
} from './ingestion'
import { keywordCapForTier } from './subscriptions'
import { WORKSPACE_ROOM_SCHEMAS } from './workspace-schemas'
import { buildQuotaMap } from './ingestion/quota'
import type { AlertRule, Keyword, Mention, WebhookEndpoint } from './types'
import { buildScoringPrompt, parseScore, SCORING_SYSTEM_PROMPT } from './scoring'
import { matchesRule, signPayload, formatMentionText } from './delivery'

/** Cheap + fast — scoring is high-volume. */
const SCORING_MODEL = 'claude-haiku-4-5-20251001'

/** Payload for the score-mention job — carries everything the scorer needs
 * so the job doesn't have to re-fetch records. */
export interface ScoreMentionPayload {
  mentionId: string
  /** Tenant whose room holds the mention (jobs queue is app-wide). */
  workspaceId?: string
  mention: Mention
  keyword: Pick<Keyword, 'term' | 'keyword_type' | 'brand_context'>
}

/** Payload for the sweep-keyword job — first crawl right after creation. */
export interface SweepKeywordPayload {
  keywordId: string
  workspaceId: string
  /** Workspace owner — quota/overage bills this user. */
  ownerId: string
}

/** Payload for the purge-keyword job — clears leftovers of a deleted
 * keyword when the inline purge in the purgeKeyword action hit its cap. */
export interface PurgeKeywordPayload {
  keywordId: string
  workspaceId: string
}

/** Payload for the purge-workspace job — wipes every tenant-room collection
 * of a deleted workspace (its registry row is already gone, so the room is
 * unreachable; this reclaims the storage). */
export interface PurgeWorkspacePayload {
  workspaceId: string
}

/**
 * Deletes per pickup across purge jobs. Each query/delete is one DO
 * subrequest and a DO invocation allows ~1000, so stay well under; a job
 * that hits the cap throws and JobRoom retries — progress persists, so
 * repeated pickups converge.
 */
const MAX_PURGE_DELETES_PER_RUN = 800

interface DeliverSlackPayload {
  mention: Mention
  ruleName: string
  channel: string
  workspaceId?: string
}

interface DeliverWebhookPayload {
  mention: Mention
  mentionId: string
  endpointId: string
  workspaceId?: string
}

export async function runJob(job: Job, _ctx: JobContext, env: unknown): Promise<unknown> {
  const e = env as IngestEnv & { SLACK_BOT_TOKEN?: string }
  // All record reads/writes happen in the payload's tenant room; jobs
  // enqueued before tenancy (no workspaceId) fall back to the app room.
  const payloadWs = (job.payload as { workspaceId?: string } | undefined)?.workspaceId
  const roomId = payloadWs ? `ws:${payloadWs}` : `app:${e.APP_NAME}`
  const tools = buildCronContext(e, e.OWNER_USER_ID, roomId)

  switch (job.type) {
    case 'score-mention': {
      const { mentionId, mention, keyword } = job.payload as unknown as ScoreMentionPayload

      // The mention may have been deleted (or already scored) between enqueue
      // and pickup — check before spending an AI call. Keeps a backlog of
      // stale jobs draining in milliseconds instead of billed seconds.
      const [current] = await tools.records.query('mentions', {
        where: { source: mention.source, source_id: mention.source_id },
        limit: 1,
      })
      if (!current) return { skipped: 'mention deleted' }
      if (current.data?.relevance && current.data.relevance !== 'pending') {
        return { skipped: 'already scored' }
      }

      const reply = await tools.integrations.call('anthropic/chat-completion', {
        model: SCORING_MODEL,
        max_tokens: 300,
        temperature: 0,
        system: SCORING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildScoringPrompt(mention, keyword as Keyword) }],
      })

      const score = parseScore(extractText(reply))

      await tools.records.update('mentions', mentionId, {
        relevance: score.relevance,
        relevance_score: score.relevance_score,
        sentiment: score.sentiment,
        tags: score.tags,
      })

      // Route the now-scored mention to matching alert rules + webhooks.
      const scored: Mention = { ...mention, ...score }
      await evaluateDeliveries(tools, e, scored, mentionId, payloadWs)

      return score
    }

    case 'sweep-keyword': {
      const { keywordId, workspaceId, ownerId } = job.payload as unknown as SweepKeywordPayload

      // Load the keyword from its tenant room; it may have been deleted or
      // paused between enqueue and pickup.
      const keywords = (await tools.records.query('keywords', {
        limit: 500,
      })) as KeywordEnvelope[]
      const keyword = keywords.find((k) => k.recordId === keywordId)
      if (!keyword || !keyword.data.is_active) return { skipped: 'keyword gone or inactive' }

      const quotas = await buildQuotaMap(tools, e, [ownerId])
      const quota = quotas.get(ownerId)

      // Same cap set as the cron sweep: a keyword beyond the plan's
      // active-keyword allowance doesn't get its first crawl either.
      const active = keywords.filter((k) => k.data.is_active)
      const cap = keywordCapForTier(quota?.tier)
      if (!keywordsWithinCap(active, cap).some((k) => k.recordId === keywordId)) {
        return { skipped: `over keyword cap (${cap})` }
      }

      await sweepKeyword(tools, e, keyword, { workspaceId, ownerId }, quota)
      return { swept: keyword.data.term }
    }

    case 'purge-keyword': {
      const { keywordId } = job.payload as unknown as PurgeKeywordPayload
      const { purged, done } = await purgeKeywordData(tools, keywordId, MAX_PURGE_DELETES_PER_RUN)
      if (!done) throw new Error(`purge incomplete after ${purged} deletes — retrying`)
      return { purged }
    }

    case 'purge-workspace': {
      // `tools` is already scoped to the ws:<id> room via the payload's
      // workspaceId. Wipe every tenant collection (derived from the schema
      // list so new collections are covered automatically). The room's
      // seeded `users` rows are left — negligible, and the room is already
      // unreachable without a registry row.
      let purged = 0
      for (const schema of WORKSPACE_ROOM_SCHEMAS) {
        for (;;) {
          if (purged >= MAX_PURGE_DELETES_PER_RUN) {
            throw new Error(`purge incomplete after ${purged} deletes — retrying`)
          }
          const batch = (await tools.records.query(schema.name, {
            limit: Math.min(100, MAX_PURGE_DELETES_PER_RUN - purged),
          })) as Array<{ recordId: string }>
          if (batch.length === 0) break
          for (const r of batch) {
            await tools.records.delete(schema.name, r.recordId)
            purged++
          }
        }
      }
      console.log(`[purge] workspace ${payloadWs}: ${purged} records deleted`)
      return { purged }
    }

    case 'deliver-slack': {
      const { mention, ruleName, channel } = job.payload as unknown as DeliverSlackPayload
      if (!e.SLACK_BOT_TOKEN) {
        // Not configured — succeed with a note rather than retry-looping.
        return { skipped: 'SLACK_BOT_TOKEN not configured' }
      }
      await tools.integrations.call('slack/send-message', {
        accessToken: e.SLACK_BOT_TOKEN,
        channel,
        text: formatMentionText(mention, ruleName),
        unfurl_links: false,
      })
      return { delivered: channel }
    }

    case 'deliver-webhook': {
      const { mention, mentionId, endpointId } = job.payload as unknown as DeliverWebhookPayload

      const endpoints = await tools.records.query('webhook_endpoints', { limit: 100 })
      const endpoint = endpoints.find((r: { recordId: string }) => r.recordId === endpointId) as
        | { recordId: string; data: WebhookEndpoint }
        | undefined
      if (!endpoint || !endpoint.data.is_active) return { skipped: 'endpoint gone or inactive' }

      const body = JSON.stringify({
        event: 'mention.scored',
        mention: { id: mentionId, ...mention },
        timestamp: new Date().toISOString(),
      })
      const signature = endpoint.data.secret ? await signPayload(endpoint.data.secret, body) : ''

      let res: Response
      try {
        res = await fetch(endpoint.data.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(signature ? { 'X-Listenpost-Signature': `sha256=${signature}` } : {}),
          },
          body,
        })
      } catch (err) {
        await bumpFailure(tools, endpoint)
        throw err // let JobRoom retry with backoff
      }

      if (!res.ok) {
        await bumpFailure(tools, endpoint)
        throw new Error(`Webhook endpoint responded ${res.status}`)
      }

      await tools.records.update('webhook_endpoints', endpoint.recordId, {
        last_delivery_at: new Date().toISOString(),
        failure_count: 0,
      })
      return { delivered: endpoint.data.url, status: res.status }
    }

    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}

/** Fan a scored mention out to matching alert rules and webhook endpoints. */
async function evaluateDeliveries(
  tools: CronContext,
  env: IngestEnv,
  mention: Mention,
  mentionId: string,
  workspaceId: string | undefined,
): Promise<void> {
  const roomId = `app:${env.APP_NAME}` // job QUEUE room — record reads use `tools`

  const rules = (await tools.records.query('alert_rules', {
    where: { is_active: 1 },
    limit: 100,
  })) as Array<{ recordId: string; data: AlertRule }>

  for (const rule of rules) {
    if (!matchesRule(mention, rule.data.match)) continue
    if (rule.data.channel === 'slack' && rule.data.target?.channelId) {
      await enqueueJob(env.JOB_ROOMS, roomId, 'deliver-slack', {
        mention,
        ruleName: rule.data.name,
        channel: rule.data.target.channelId,
        workspaceId,
      })
    } else if (rule.data.channel === 'webhook' && rule.data.target?.endpointId) {
      await enqueueJob(
        env.JOB_ROOMS,
        roomId,
        'deliver-webhook',
        { mention, mentionId, endpointId: rule.data.target.endpointId, workspaceId },
        { maxAttempts: 3 },
      )
    }
    // channel === 'email' is handled by the digest cron, not real-time.
  }

  // Standalone webhooks: every active endpoint whose own filters match.
  const endpoints = (await tools.records.query('webhook_endpoints', {
    where: { is_active: 1 },
    limit: 100,
  })) as Array<{ recordId: string; data: WebhookEndpoint }>

  const ruleTargets = new Set(
    rules
      .filter((r) => r.data.channel === 'webhook')
      .map((r) => r.data.target?.endpointId)
      .filter(Boolean),
  )
  for (const endpoint of endpoints) {
    if (ruleTargets.has(endpoint.recordId)) continue // already routed via a rule
    if (!matchesRule(mention, endpoint.data.filters)) continue
    await enqueueJob(
      env.JOB_ROOMS,
      roomId,
      'deliver-webhook',
      { mention, mentionId, endpointId: endpoint.recordId, workspaceId },
      { maxAttempts: 3 },
    )
  }
}

async function bumpFailure(
  tools: CronContext,
  endpoint: { recordId: string; data: WebhookEndpoint },
): Promise<void> {
  try {
    await tools.records.update('webhook_endpoints', endpoint.recordId, {
      failure_count: (endpoint.data.failure_count ?? 0) + 1,
    })
  } catch {
    // Never let bookkeeping mask the real delivery error.
  }
}

/** Anthropic Messages API reply → concatenated text blocks. */
function extractText(reply: unknown): string {
  const r = reply as { content?: Array<{ type?: string; text?: string }> }
  if (Array.isArray(r?.content)) {
    return r.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
  }
  if (typeof reply === 'string') return reply
  throw new Error(`Unexpected model reply shape: ${JSON.stringify(reply).slice(0, 200)}`)
}
