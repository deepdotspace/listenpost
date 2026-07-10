/**
 * WorkspaceProvider — tenancy context for multi-tenant workspaces.
 *
 * Mounted INSIDE the app-room RecordScope (it reads the `workspaces`
 * collection + `useUsers` from the app room) and ABOVE the per-tenant
 * `ws:<id>` RecordScope that _app.tsx mounts around the routed content.
 *
 * RBAC already scopes the `workspaces` query to rows the caller owns or is
 * listed in via `member_ids` (read: 'shared' + collaboratorsField), so
 * `workspaces` here is exactly "the workspaces I can enter".
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth, useMutations, useQuery, useUsers, type RecordData } from 'deepspace'

const STORAGE_KEY = 'listenpost-workspace'

export interface WorkspaceData {
  name: string
  brand_context?: string
  /** Stamped server-side (userBound) — the workspace owner. */
  owner_user?: string
  /** JSON array of member userIds (owner included). May arrive as a raw string. */
  member_ids?: string[] | string
  is_active?: boolean | number
}

export type WorkspaceEnvelope = RecordData<WorkspaceData>

export interface WorkspaceMember {
  id: string
  name: string
  email: string
  imageUrl?: string
  isOwner: boolean
}

export type WorkspaceOpResult = { ok: true } | { ok: false; error: string }

export interface WorkspaceContextValue {
  /** Workspaces the signed-in user can see (owner or member). */
  workspaces: WorkspaceEnvelope[]
  /** Selected workspace envelope, or null when none exist / signed out. */
  current: WorkspaceEnvelope | null
  /** `current?.recordId ?? null` — the `<id>` in roomId `ws:<id>`. */
  currentId: string | null
  /** True while the workspaces query is still loading. */
  loading: boolean
  /** True when the signed-in user owns the current workspace. */
  isOwner: boolean
  /** Resolved member list (owner first) for the current workspace. */
  members: WorkspaceMember[]
  /** Select a workspace; persisted to localStorage. */
  select: (id: string) => void
  /** Create + auto-select a workspace; resolves to its recordId. */
  createWorkspace: (name: string, brandContext?: string) => Promise<string>
  /** Owner-only: add a member by email (app-room user lookup). */
  inviteByEmail: (email: string) => Promise<WorkspaceOpResult>
  /** Owner-only: remove a member (never the owner). */
  removeMember: (userId: string) => Promise<WorkspaceOpResult>
}

/** Defensive parse — json-interpreted columns can surface as raw strings. */
export function memberIdsOf(ws: WorkspaceEnvelope | null): string[] {
  const raw = ws?.data.member_ids
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string')
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

function ownerOf(ws: WorkspaceEnvelope): string {
  return ws.data.owner_user || ws.createdBy
}

const NOT_SIGNED_IN = 'Not signed in'

const SIGNED_OUT_VALUE: WorkspaceContextValue = {
  workspaces: [],
  current: null,
  currentId: null,
  loading: false,
  isOwner: false,
  members: [],
  select: () => {},
  createWorkspace: async () => {
    throw new Error(NOT_SIGNED_IN)
  },
  inviteByEmail: async () => ({ ok: false, error: NOT_SIGNED_IN }),
  removeMember: async () => ({ ok: false, error: NOT_SIGNED_IN }),
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth()
  // Signed-out visitors (landing, pricing) get an inert context — running the
  // `workspaces` query anonymously would just 401 and pollute the console.
  if (!isSignedIn) {
    return (
      <WorkspaceContext.Provider value={SIGNED_OUT_VALUE}>{children}</WorkspaceContext.Provider>
    )
  }
  return <SignedInWorkspaceProvider>{children}</SignedInWorkspaceProvider>
}

function SignedInWorkspaceProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const { records, status } = useQuery<WorkspaceData>('workspaces', { orderBy: 'createdAt' })
  const { create, put } = useMutations<WorkspaceData>('workspaces')
  // App-room user directory — invite-by-email resolves against it.
  const { users } = useUsers()

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  // Only offer workspaces the user can actually ENTER (owner or member).
  // RBAC already filters for normal users, but app-room ADMINS read every
  // registry row — without this filter their switcher lists foreign
  // workspaces whose ws-room gate correctly 403s them (a connect/close
  // loop and a dead app). Entering always requires membership.
  const workspaces = useMemo(() => {
    const all = (records ?? []) as WorkspaceEnvelope[]
    if (!userId) return all
    return all.filter(
      (w) =>
        ownerOf(w) === userId ||
        (Array.isArray(w.data.member_ids) && w.data.member_ids.includes(userId)),
    )
  }, [records, userId])

  // Restore the persisted selection; fall back to the first visible workspace
  // (covers a stale id from a deleted workspace or another account).
  const current = useMemo(
    () => workspaces.find((w) => w.recordId === selectedId) ?? workspaces[0] ?? null,
    [workspaces, selectedId],
  )
  const currentId = current?.recordId ?? null
  const loading = status === 'loading'
  const isOwner = !!current && !!userId && ownerOf(current) === userId

  const select = useCallback((id: string) => {
    setSelectedId(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* private mode etc. — selection still works for this session */
    }
  }, [])

  const createWorkspace = useCallback(
    async (name: string, brandContext?: string) => {
      if (!userId) throw new Error(NOT_SIGNED_IN)
      // Include the creator in member_ids: read-'shared' passes for the owner
      // regardless, but the worker's ws-room gate reads the full member list.
      const recordId = await create({
        name: name.trim(),
        brand_context: (brandContext ?? '').trim(),
        member_ids: [userId],
      })
      select(recordId)
      return recordId
    },
    [create, select, userId],
  )

  const members: WorkspaceMember[] = useMemo(() => {
    if (!current) return []
    const owner = ownerOf(current)
    const ids = memberIdsOf(current)
    const ordered = owner ? [owner, ...ids.filter((id) => id !== owner)] : ids
    return ordered.map((id) => {
      const u = users.find((x) => x.id === id)
      return {
        id,
        name: u?.name ?? '',
        email: u?.email ?? '',
        imageUrl: u?.imageUrl,
        isOwner: id === owner,
      }
    })
  }, [current, users])

  const inviteByEmail = useCallback(
    async (email: string): Promise<WorkspaceOpResult> => {
      const needle = email.trim().toLowerCase()
      if (!needle) return { ok: false, error: 'Enter an email address' }
      if (!current) return { ok: false, error: 'No workspace selected' }
      if (!userId || ownerOf(current) !== userId) {
        return { ok: false, error: 'Only the workspace owner can invite members' }
      }
      const target = users.find((u) => u.email?.toLowerCase() === needle)
      if (!target) {
        return { ok: false, error: 'No account found for that email — they need to sign in once first' }
      }
      const ids = memberIdsOf(current)
      if (ids.includes(target.id) || target.id === ownerOf(current)) {
        return { ok: false, error: 'Already a member of this workspace' }
      }
      try {
        await put(current.recordId, { member_ids: [...ids, target.id] })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
    [current, put, userId, users],
  )

  const removeMember = useCallback(
    async (memberId: string): Promise<WorkspaceOpResult> => {
      if (!current) return { ok: false, error: 'No workspace selected' }
      if (!userId || ownerOf(current) !== userId) {
        return { ok: false, error: 'Only the workspace owner can remove members' }
      }
      if (memberId === ownerOf(current)) {
        return { ok: false, error: 'The owner cannot be removed' }
      }
      const ids = memberIdsOf(current)
      if (!ids.includes(memberId)) return { ok: false, error: 'Not a member' }
      try {
        await put(current.recordId, { member_ids: ids.filter((id) => id !== memberId) })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
    [current, put, userId],
  )

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      current,
      currentId,
      loading,
      isOwner,
      members,
      select,
      createWorkspace,
      inviteByEmail,
      removeMember,
    }),
    [
      workspaces,
      current,
      currentId,
      loading,
      isOwner,
      members,
      select,
      createWorkspace,
      inviteByEmail,
      removeMember,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
