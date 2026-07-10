/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; each fire is recorded in the DO's `cron_history` table and
 * pushed to subscribers over `/ws/cron/:roomId`.
 */

import type { CronTask } from 'deepspace/worker'
import { buildCronContext } from 'deepspace/worker'
import { runIngestion } from './ingestion'
import type { CronContext, IngestEnv } from './ingestion/context'
import type { Digest, Mention } from './types'
import { digestIsDue, formatMentionText, matchesRule } from './delivery'

export const tasks: CronTask[] = [
  // Low-cost liveness probe — the cron e2e spec asserts against its history.
  { name: 'heartbeat', intervalMinutes: 1 },
  // Poll every active keyword × enabled source for new mentions.
  { name: 'poll-sources', intervalMinutes: 5 },
  // Send any daily/weekly digests whose local send-time has passed.
  { name: 'send-digests', intervalMinutes: 15 },
]

interface WorkspaceRow {
  recordId: string
  data: { name?: string; owner_user?: string; is_active?: number }
}

/** Active workspaces from the app-room registry (tenancy root). */
async function listWorkspaces(ctx: CronContext): Promise<WorkspaceRow[]> {
  return (await ctx.records.query('workspaces', {
    where: { is_active: 1 },
    limit: 200,
  })) as WorkspaceRow[]
}

export async function runTask(name: string, env: unknown): Promise<void> {
  if (name === 'heartbeat') return // liveness only; the DO records the run

  const e = env as IngestEnv
  const appCtx = buildCronContext(e, e.OWNER_USER_ID, `app:${e.APP_NAME}`)

  // Multi-tenant sweep: each workspace's data lives in its own room.
  const workspaces = await listWorkspaces(appCtx)

  for (const ws of workspaces) {
    const wsCtx = buildCronContext(e, e.OWNER_USER_ID, `ws:${ws.recordId}`)
    try {
      if (name === 'poll-sources') {
        await runIngestion(wsCtx, e, {
          workspaceId: ws.recordId,
          ownerId: ws.data.owner_user ?? e.OWNER_USER_ID,
        })
      } else if (name === 'send-digests') {
        await sendDueDigests(wsCtx, e)
      }
    } catch (err) {
      // One tenant's failure must not stall the sweep for the others.
      console.error(`[cron] ${name} failed for workspace ${ws.recordId}:`, err)
    }
  }
}

const EMAIL_FROM_DEFAULT = 'Octolens <notifications@app.space>'

async function sendDueDigests(ctx: CronContext, env: IngestEnv): Promise<void> {
  const digests = (await ctx.records.query('digests', {
    where: { is_active: 1 },
    limit: 100,
  })) as Array<{ recordId: string; data: Digest }>

  const now = Date.now()
  for (const digest of digests) {
    if (!digestIsDue(digest.data, now)) continue
    try {
      await sendDigest(ctx, env, digest)
      await ctx.records.update('digests', digest.recordId, {
        last_sent_at: new Date(now).toISOString(),
      })
    } catch (err) {
      console.error(`[digest] send failed for ${digest.recordId}:`, err)
    }
  }
}

async function sendDigest(
  ctx: CronContext,
  env: IngestEnv & { EMAIL_FROM?: string; SLACK_BOT_TOKEN?: string },
  digest: { recordId: string; data: Digest },
): Promise<void> {
  const windowMs = digest.data.schedule === 'weekly' ? 7 * 24 * 3600_000 : 24 * 3600_000
  const sinceMs = Math.max(
    Date.now() - windowMs,
    digest.data.last_sent_at ? new Date(digest.data.last_sent_at).getTime() : 0,
  )

  // Equality-only `where` — pull a recent page and window/filter here.
  const recent = (await ctx.records.query('mentions', { limit: 500 })) as Array<{
    data: Mention
    createdAt: string
  }>
  const matching = recent.filter(
    (r) =>
      new Date(r.createdAt).getTime() >= sinceMs &&
      r.data.relevance !== 'pending' &&
      matchesRule(r.data, digest.data.filters),
  )
  if (matching.length === 0) return // nothing to report — skip quietly

  const period = digest.data.schedule === 'weekly' ? 'This week' : 'Today'
  const subject = `${period}: ${matching.length} mention${matching.length > 1 ? 's' : ''} — Octolens digest`

  if (digest.data.target?.email) {
    const itemsHtml = matching
      .slice(0, 25)
      .map((r) => {
        const m = r.data
        const title = m.title || (m.body ?? '').slice(0, 100) || m.url || 'mention'
        return `<li style="margin-bottom:12px">
          <a href="${m.url ?? '#'}" style="font-weight:600">${escapeHtml(title)}</a><br>
          <small>${m.source} · relevance: ${m.relevance} · ${m.sentiment}${(m.tags ?? []).length ? ' · ' + (m.tags ?? []).join(', ') : ''}</small>
        </li>`
      })
      .join('\n')
    await ctx.integrations.call('email/send', {
      from: env.EMAIL_FROM || EMAIL_FROM_DEFAULT,
      to: digest.data.target.email,
      subject,
      html: `<h2>${subject}</h2><ul style="padding-left:16px">${itemsHtml}</ul>`,
    })
  } else if (digest.data.target?.channelId && env.SLACK_BOT_TOKEN) {
    const text = [
      `*${subject}*`,
      ...matching.slice(0, 10).map((r) => formatMentionText(r.data).split('\n').slice(1).join(' — ')),
    ].join('\n')
    await ctx.integrations.call('slack/send-message', {
      accessToken: env.SLACK_BOT_TOKEN,
      channel: digest.data.target.channelId,
      text,
    })
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
