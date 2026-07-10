/**
 * Workspace (tenant) access resolution — shared by worker.ts (WebSocket
 * gate) and the AI chat routes. The registry row lives in the APP room;
 * each workspace's data lives in its own RecordRoom DO (`ws:<id>`).
 */

export interface WorkspaceAccessEnv {
  RECORD_ROOMS: DurableObjectNamespace
  APP_NAME: string
  OWNER_USER_ID: string
}

export type WorkspaceRole = 'admin' | 'member'

/** Owner (or app owner) → admin; listed member → member; otherwise null. */
export async function resolveWorkspaceRole(
  env: WorkspaceAccessEnv,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.APP_NAME}`))
  try {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': env.OWNER_USER_ID,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({
          tool: 'records.get',
          params: { collection: 'workspaces', recordId: workspaceId },
        }),
      }),
    )
    const json = (await res.json()) as {
      success?: boolean
      data?: {
        record?: { data?: { owner_user?: string; member_ids?: string[]; is_active?: number } }
      }
    }
    const ws = json.success ? json.data?.record?.data : undefined
    if (!ws || !ws.is_active) return null
    if (ws.owner_user === userId || userId === env.OWNER_USER_ID) return 'admin'
    if (Array.isArray(ws.member_ids) && ws.member_ids.includes(userId)) return 'member'
    return null
  } catch {
    return null
  }
}

/** RecordRoom DO stub for a workspace's data room. */
export function workspaceRoomStub(env: WorkspaceAccessEnv, workspaceId: string): DurableObjectStub {
  return env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`ws:${workspaceId}`))
}

/**
 * Make sure the workspace OWNER's users row inside the tenant room carries
 * role=admin. The connection gate resolves the owner as admin, but the
 * room seeds first-time users as `member` — and `useUser().role` (which
 * gates admin-only tenant UI like webhook endpoints) reads that row, so
 * without this an owner can't manage their own workspace. `users.register`
 * with isAdmin force-elevates existing rows; idempotent.
 */
export async function ensureWorkspaceAdminRow(
  env: WorkspaceAccessEnv,
  workspaceId: string,
  user: { userId: string; name?: string; email?: string; imageUrl?: string },
): Promise<void> {
  const stub = workspaceRoomStub(env, workspaceId)
  try {
    await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': env.OWNER_USER_ID,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({
          tool: 'users.register',
          params: {
            userId: user.userId,
            name: user.name ?? '',
            email: user.email ?? '',
            imageUrl: user.imageUrl,
            isAdmin: true,
          },
        }),
      }),
    )
  } catch {
    // Best-effort — a failed elevation shouldn't block the connection; the
    // next connect retries it.
  }
}
