/**
 * Background-job handler — invoked by AppJobRoom (worker.ts) for every
 * job picked up from the queue. Dispatch on `job.type`; return a result
 * or throw to fail (retried up to `maxAttempts`).
 */

import type { Job, JobContext } from 'deepspace/worker'
import { buildCronContext } from 'deepspace/worker'
import type { IngestEnv } from './ingestion/context'
import type { Keyword, Mention } from './types'
import { buildScoringPrompt, parseScore, SCORING_SYSTEM_PROMPT } from './scoring'

/** Cheap + fast — scoring is high-volume. */
const SCORING_MODEL = 'claude-haiku-4-5-20251001'

/** Payload for the score-mention job — carries everything the scorer needs
 * so the job doesn't have to re-fetch records. */
export interface ScoreMentionPayload {
  mentionId: string
  mention: Mention
  keyword: Pick<Keyword, 'term' | 'keyword_type' | 'brand_context'>
}

export async function runJob(job: Job, _ctx: JobContext, env: unknown): Promise<unknown> {
  const e = env as IngestEnv
  const tools = buildCronContext(e, e.OWNER_USER_ID, `app:${e.APP_NAME}`)

  switch (job.type) {
    case 'score-mention': {
      const { mentionId, mention, keyword } = job.payload as unknown as ScoreMentionPayload

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

      return score
    }

    default:
      throw new Error(`Unknown job type: ${job.type}`)
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
