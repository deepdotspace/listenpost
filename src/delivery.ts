/**
 * Outbound delivery — alert-rule matching, webhook signing, digest
 * scheduling. Pure logic lives here (unit-tested); I/O happens in the
 * jobs/cron handlers that call it.
 */

import type { AlertRuleMatch, Mention, Relevance } from './types'

const RELEVANCE_RANK: Record<Exclude<Relevance, 'pending'>, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

/** Does a scored mention satisfy a rule/webhook/digest match object? */
export function matchesRule(mention: Mention, match: AlertRuleMatch | undefined | null): boolean {
  if (!match) return true

  if (match.sources?.length && !match.sources.includes(mention.source)) return false

  if (match.sentiment?.length) {
    if (!mention.sentiment || !match.sentiment.includes(mention.sentiment)) return false
  }

  if (match.relevance_min) {
    const rel = mention.relevance
    if (!rel || rel === 'pending') return false
    if (RELEVANCE_RANK[rel] < RELEVANCE_RANK[match.relevance_min]) return false
  }

  if (match.keyword_ids?.length) {
    const ids = mention.keyword_ids ?? (mention.keyword_id ? [mention.keyword_id] : [])
    if (!ids.some((id) => match.keyword_ids!.includes(id))) return false
  }

  if (match.tags?.length) {
    const tags = mention.tags ?? []
    if (!match.tags.some((t) => tags.includes(t))) return false
  }

  return true
}

/** HMAC-SHA256 hex signature for webhook payloads (Web Crypto). */
export async function signPayload(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** One-line Slack/text summary of a mention. */
export function formatMentionText(mention: Mention, ruleName?: string): string {
  const head = ruleName ? `🔔 *${ruleName}*` : '🔔 New mention'
  const title = mention.title || (mention.body ?? '').slice(0, 80) || mention.url || ''
  const meta = [
    mention.source,
    mention.relevance && mention.relevance !== 'pending' ? `relevance: ${mention.relevance}` : null,
    mention.sentiment && mention.sentiment !== 'pending' ? mention.sentiment : null,
    ...(mention.tags ?? []),
  ]
    .filter(Boolean)
    .join(' · ')
  return `${head}\n${title}\n${meta}\n${mention.url ?? ''}`
}

/**
 * Is a digest due now? `nowMs` is injectable for tests.
 * Daily: due when local time in `timezone` has passed `time` and the last
 * send was before today's target. Weekly: same, but only on Mondays.
 */
export function digestIsDue(
  digest: {
    schedule: 'daily' | 'weekly'
    time?: string
    timezone?: string
    last_sent_at?: string
    is_active?: number
  },
  nowMs: number,
): boolean {
  if (!digest.is_active) return false
  const tz = digest.timezone || 'UTC'
  const [hh, mm] = (digest.time || '09:00').split(':').map(Number)

  let parts: { weekday: string; local: Date }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const map = Object.fromEntries(fmt.formatToParts(nowMs).map((p) => [p.type, p.value]))
    parts = {
      weekday: map.weekday,
      local: new Date(
        `${map.year}-${map.month}-${map.day}T${map.hour === '24' ? '00' : map.hour}:${map.minute}:00Z`,
      ),
    }
  } catch {
    return false // bad timezone string — never due, surfaced in UI instead
  }

  if (digest.schedule === 'weekly' && parts.weekday !== 'Mon') return false

  const targetLocal = new Date(parts.local)
  targetLocal.setUTCHours(hh, mm, 0, 0)
  if (parts.local.getTime() < targetLocal.getTime()) return false // not reached today

  if (!digest.last_sent_at) return true
  // Already sent after today's (local) target? Compare in wall-clock terms:
  // the gap since last send must exceed ~20h (daily) / ~6d (weekly) to
  // tolerate cron jitter without double-sending.
  const sinceMs = nowMs - new Date(digest.last_sent_at).getTime()
  const minGapMs = digest.schedule === 'daily' ? 20 * 3600_000 : 6 * 24 * 3600_000
  return sinceMs >= minGapMs
}
