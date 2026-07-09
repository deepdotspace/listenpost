/**
 * Admin Page
 *
 * User management + app settings page.
 * - useUsers for listing all users
 * - setRole for changing user roles
 * - Admin-only settings collection
 * - useQuery with admin permissions
 */

import { useState, useMemo } from 'react'
import { useUser } from 'deepspace'
import { useUsers } from 'deepspace'
import { useQuery } from 'deepspace'
import { useMutations } from 'deepspace'
import { ShieldAlert, Trash2, UserPlus, MoreVertical } from 'lucide-react'
import {
  Button,
  Input,
  ConfirmModal,
  EmptyState,
  Skeleton,
  DropdownMenu,
  useToast,
  cn,
} from '@/components/ui'
import { PageHeader, SectionLabel } from '../../components/PageHeader'
import { ROLE_CONFIG } from 'deepspace'

// ============================================================================
// Types
// ============================================================================

interface Setting {
  key: string
  value: string
}

// ============================================================================
// Presentation helpers
// ============================================================================

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-primary/[0.08] text-primary',
  member: 'bg-[#e7f2ff] text-[#2563eb]',
  viewer: 'bg-[#f3f4f6] text-[#7a8290]',
}

const AVATAR_COLORS = ['#e0645c', '#4b8dd6', '#3fae82', '#b4761f', '#7c6cf0', '#d6699f']

function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 2) return 'Active now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function roleTitle(role: string): string {
  const cfg = (ROLE_CONFIG as Record<string, { title: string }>)[role]
  return cfg?.title ?? role
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-card">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[24px] font-bold tracking-tight tabular-nums text-foreground">
        {value}
        {suffix && <span className="text-[14px] font-medium text-tertiary"> {suffix}</span>}
      </div>
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function AdminPage() {
  const { user } = useUser()
  const isAdmin = user?.role === 'admin'
  const { users, setRole } = useUsers()
  const toast = useToast()

  // Security: Don't render admin content if not an admin
  if (!isAdmin) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Admin" />
        <div className="flex-1 px-4 py-5 sm:px-5">
          <div className="mx-auto max-w-3xl rounded-xl border border-border shadow-card">
            <EmptyState
              icon={<ShieldAlert aria-hidden />}
              title="Access denied"
              description="You don't have permission to view this page."
            />
          </div>
        </div>
      </div>
    )
  }

  const adminCount = users.filter((u) => u.role === 'admin').length
  const activeToday = users.filter((u) => {
    const ms = Date.now() - new Date(u.lastSeenAt).getTime()
    return !Number.isNaN(ms) && ms < 24 * 60 * 60 * 1000
  }).length

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Admin"
        meta={
          <span>
            {users.length} {users.length === 1 ? 'member' : 'members'}
          </span>
        }
        actions={
          <Button
            size="sm"
            className="h-8 gap-1.5 px-3 text-[12.5px] [&_svg]:size-3.5"
            onClick={() =>
              toast.success('Invite teammates', 'Share the app link — new sign-ins join as members.')
            }
          >
            <UserPlus aria-hidden />
            Invite
          </Button>
        }
      />

      <div className="flex-1 px-4 py-5 sm:px-5">
        <div className="space-y-5">
          {/* Usage stats — derived from real data. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Members" value={String(users.length)} />
            <StatCard label="Admins" value={String(adminCount)} />
            <StatCard label="Active today" value={String(activeToday)} />
          </div>

          {/* Members */}
          <section>
            <SectionLabel className="mb-2.5 text-tertiary">Members</SectionLabel>
            <UsersPanel
              users={users}
              currentUserId={user?.id}
              onSetRole={(userId, role) => {
                setRole(userId, role)
                toast.success('Role updated successfully')
              }}
            />
          </section>

          {/* App settings */}
          <section>
            <SectionLabel className="mb-2.5 text-tertiary">App settings</SectionLabel>
            <SettingsPanel toast={toast} />
          </section>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Users Panel
// ============================================================================

interface UsersPanelProps {
  users: Array<{
    id: string
    email: string
    name: string
    imageUrl?: string
    role: string
    lastSeenAt: string
  }>
  currentUserId?: string
  onSetRole: (userId: string, role: string) => void
}

function UsersPanel({ users, currentUserId, onSetRole }: UsersPanelProps) {
  // Sort users by last seen
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) =>
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    )
  }, [users])

  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-border shadow-card">
        <EmptyState title="No users found" />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[1.4fr_1fr_110px_110px_34px] items-center gap-3.5 border-b border-border px-[18px] py-2.5 text-[10px] font-bold uppercase tracking-[0.07em] text-tertiary">
            <span>Member</span>
            <span>Email</span>
            <span>Role</span>
            <span>Last active</span>
            <span />
          </div>

          {sortedUsers.map((u) => {
            const isCurrentUser = u.id === currentUserId
            const initial = u.name?.[0]?.toUpperCase() ?? '?'
            return (
              <div
                key={u.id}
                className="group grid grid-cols-[1.4fr_1fr_110px_110px_34px] items-center gap-3.5 border-b border-border px-[18px] py-3 transition-colors last:border-b-0 hover:bg-[#fafbfc]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: avatarColor(u.id || u.name || initial) }}
                  >
                    {initial}
                  </span>
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-foreground">{u.name}</span>
                    {isCurrentUser && <span className="text-[11px] text-tertiary">(you)</span>}
                  </span>
                </div>

                <div className="truncate text-[12.5px] text-muted-foreground">{u.email}</div>

                <div>
                  <span
                    className={cn(
                      'inline-flex h-5 items-center rounded-md px-2 text-[10.5px] font-semibold',
                      ROLE_BADGE[u.role] ?? ROLE_BADGE.viewer,
                    )}
                  >
                    {roleTitle(u.role)}
                  </span>
                </div>

                <div className="text-[12px] text-tertiary">{relTime(u.lastSeenAt)}</div>

                <div className="flex justify-center">
                  {isCurrentUser ? (
                    <button
                      type="button"
                      disabled
                      aria-label="You can't change your own role"
                      className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-tertiary opacity-40 [&_svg]:size-[15px]"
                    >
                      <MoreVertical aria-hidden />
                    </button>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenu.Trigger
                        chevron={false}
                        aria-label="Member actions"
                        className="h-[26px] w-[26px] justify-center border-transparent px-0 text-tertiary hover:bg-secondary hover:text-foreground [&_svg]:size-[15px]"
                      >
                        <MoreVertical aria-hidden />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        <DropdownMenu.Label>Change role</DropdownMenu.Label>
                        {Object.keys(ROLE_CONFIG).map((role) => (
                          <DropdownMenu.Item
                            key={role}
                            selected={role === u.role}
                            onClick={() => role !== u.role && onSetRole(u.id, role)}
                          >
                            {roleTitle(role)}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.Content>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Settings Panel
// ============================================================================

interface SettingsPanelProps {
  toast: ReturnType<typeof useToast>
}

function SettingsPanel({ toast }: SettingsPanelProps) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  // Query settings (admin-only collection)
  const { records: settings, status } = useQuery<Setting>('settings')
  const { create, remove } = useMutations<Setting>('settings')

  const handleCreate = async () => {
    if (!newKey.trim() || !newValue.trim()) return

    await create({ key: newKey.trim(), value: newValue.trim() })
    setNewKey('')
    setNewValue('')
    toast.success('Setting created')
  }

  return (
    <div className="space-y-2.5">
      {/* Add new setting */}
      <div className="rounded-xl border border-border bg-card p-3 shadow-card">
        <div className="flex gap-2">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Key"
            className="h-9 text-[13px]"
          />
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Value"
            className="h-9 text-[13px]"
          />
          <Button size="sm" className="h-9" onClick={handleCreate} disabled={!newKey.trim() || !newValue.trim()}>
            Add
          </Button>
        </div>
      </div>

      {/* Settings list */}
      {status === 'loading' ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ) : settings.length === 0 ? (
        <div className="rounded-xl border border-border shadow-card">
          <EmptyState title="No settings configured" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {settings.map((setting) => (
            <div
              key={setting.recordId}
              className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 items-baseline gap-2">
                <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] text-primary">
                  {setting.data.key}
                </code>
                <span className="text-[11.5px] text-tertiary">=</span>
                <span className="truncate text-[13px] text-foreground">{setting.data.value}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete setting ${setting.data.key}`}
                onClick={() => setDeleting(setting.recordId)}
                className="h-7 w-7 p-0 text-tertiary hover:bg-destructive/10 hover:text-destructive [&_svg]:size-3.5"
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) {
            await remove(deleting)
            toast.success('Setting deleted')
          }
          setDeleting(null)
        }}
        title="Delete this setting?"
        description="This cannot be undone."
        confirmText="Delete"
      />
    </div>
  )
}
