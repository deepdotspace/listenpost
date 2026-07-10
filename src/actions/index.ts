import type { ActionHandler } from 'deepspace/worker'
import { buildCronContext, enqueueJob } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  getWorkspaceData,
  resolveWorkspaceRole,
  workspaceRoleFor,
  type WorkspaceRowData,
} from '../server/workspace-access'
import { purgeKeywordData } from '../ingestion'
import type { PurgeKeywordPayload, SweepKeywordPayload } from '../jobs'

/** Workspace row iff `userId` is a member (or the app owner); else null. */
async function requireMembership(
  env: Env,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRowData | null> {
  const ws = await getWorkspaceData(env, workspaceId)
  return ws && workspaceRoleFor(env, ws, userId) ? ws : null
}

/** SHA-256 hex of a raw API key — the only form we ever store. */
export async function hashApiKey(rawKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const actions: Record<string, ActionHandler<Env>> = {
  /**
   * Generate a data-layer API key, bound to one workspace. The raw key is
   * returned ONCE and never stored — only its SHA-256 hash. Runs as a
   * server action because clients can't create api_keys rows (RBAC:
   * create false); the workspace membership check is the tenant boundary.
   */
  generateApiKey: async ({ userId, params, tools, env }) => {
    const label = String(params.label ?? '').trim()
    if (!label) return { success: false, error: 'label required' }

    const workspaceId = String(params.workspaceId ?? '').trim()
    if (!workspaceId) return { success: false, error: 'workspaceId required' }
    const role = await resolveWorkspaceRole(env, workspaceId, userId)
    if (!role) return { success: false, error: 'not a member of this workspace' }

    const bytes = crypto.getRandomValues(new Uint8Array(24))
    const rawKey = 'lpk_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    const keyHash = await hashApiKey(rawKey)
    const prefix = rawKey.slice(0, 12)

    const created = await tools.create('api_keys', {
      label,
      key_hash: keyHash,
      prefix,
      scopes: ['mentions:read'],
      workspace_id: workspaceId,
      is_active: 1,
      created_by_user: userId,
    })
    if (!created.success) return created

    return { success: true, data: { rawKey, prefix, recordId: created.data.recordId } }
  },

  /**
   * Kick off an immediate first crawl for one keyword instead of waiting
   * for the next poll-sources cron cycle. Enqueues a `sweep-keyword` job
   * (src/jobs.ts) so the fetch runs durably in the background and the
   * create-keyword UI isn't blocked on slow sources. Any workspace member
   * can trigger it — the same people who can create keywords.
   */
  sweepKeyword: async ({ userId, params, env }) => {
    const workspaceId = String(params.workspaceId ?? '').trim()
    const keywordId = String(params.keywordId ?? '').trim()
    if (!workspaceId || !keywordId) {
      return { success: false, error: 'workspaceId and keywordId required' }
    }

    const ws = await requireMembership(env, workspaceId, userId)
    if (!ws) return { success: false, error: 'not a member of this workspace' }

    await enqueueJob(
      env.JOB_ROOMS,
      `app:${env.APP_NAME}`,
      'sweep-keyword',
      {
        keywordId,
        workspaceId,
        ownerId: ws.owner_user ?? env.OWNER_USER_ID,
      } satisfies SweepKeywordPayload,
      { maxAttempts: 2 },
    )
    return { success: true, data: { queued: true } }
  },

  /**
   * Clear the mentions + source cursors of a just-deleted keyword. Purges
   * inline (capped) so the feed empties immediately AND pending
   * score-mention jobs for those rows skip fast instead of making billed
   * AI calls; anything past the cap drains via a purge-keyword job, with
   * the cron orphan sweep as the final backstop.
   */
  purgeKeyword: async ({ userId, params, env }) => {
    const workspaceId = String(params.workspaceId ?? '').trim()
    const keywordId = String(params.keywordId ?? '').trim()
    if (!workspaceId || !keywordId) {
      return { success: false, error: 'workspaceId and keywordId required' }
    }

    const ws = await requireMembership(env, workspaceId, userId)
    if (!ws) return { success: false, error: 'not a member of this workspace' }

    const ctx = buildCronContext(env, env.OWNER_USER_ID, `ws:${workspaceId}`)
    const { purged, done } = await purgeKeywordData(ctx, keywordId)
    if (!done) {
      await enqueueJob(
        env.JOB_ROOMS,
        `app:${env.APP_NAME}`,
        'purge-keyword',
        { keywordId, workspaceId } satisfies PurgeKeywordPayload,
        { maxAttempts: 3 },
      )
    }
    return { success: true, data: { purged, done } }
  },
}
