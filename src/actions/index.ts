import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { resolveWorkspaceRole } from '../server/workspace-access'

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
    const rawKey = 'olk_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
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
}
