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
import { ShieldAlert, Trash2 } from 'lucide-react'
import {
  Button,
  Input,
  Avatar,
  AvatarFallback,
  ConfirmModal,
  EmptyState,
  Skeleton,
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
        <div className="flex-1 px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-lg border border-border">
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

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Admin"
        meta={<span>{users.length} {users.length === 1 ? 'user' : 'users'}</span>}
      />

      <div className="flex-1 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="space-y-2">
            <SectionLabel>Users</SectionLabel>
            <UsersPanel
              users={users}
              currentUserId={user?.id}
              onSetRole={(userId, role) => {
                setRole(userId, role)
                toast.success('Role updated successfully')
              }}
            />
          </section>

          <section className="space-y-2">
            <SectionLabel>App settings</SectionLabel>
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
      <div className="rounded-lg border border-border">
        <EmptyState title="No users found" />
      </div>
    )
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card/50">
      {sortedUsers.map(user => {
        const isCurrentUser = user.id === currentUserId

        return (
          <div key={user.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar className="size-6">
                <AvatarFallback className="text-[10px]">
                  {user.name?.[0]?.toUpperCase() ?? '?'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[13px] font-medium text-foreground">{user.name}</span>
                  {isCurrentUser && (
                    <span className="text-[11px] text-muted-foreground">(you)</span>
                  )}
                </div>
                <p className="truncate text-[11.5px] text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden font-mono text-[11px] text-muted-foreground/80 sm:inline">
                last seen {new Date(user.lastSeenAt).toLocaleDateString()}
              </span>

              <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                  <button
                    key={role}
                    type="button"
                    disabled={isCurrentUser}
                    onClick={() => role !== user.role && onSetRole(user.id, role)}
                    className={cn(
                      'rounded px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50',
                      role === user.role
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {config.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })}
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
    <div className="space-y-2">
      {/* Add new setting */}
      <div className="rounded-lg border border-border bg-card/50 p-3">
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
          <Button size="sm" onClick={handleCreate} disabled={!newKey.trim() || !newValue.trim()}>
            Add
          </Button>
        </div>
      </div>

      {/* Settings list */}
      {status === 'loading' ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ) : settings.length === 0 ? (
        <div className="rounded-lg border border-border">
          <EmptyState title="No settings configured" />
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card/50">
          {settings.map(setting => (
            <div key={setting.recordId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 items-baseline gap-2">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary">
                  {setting.data.key}
                </code>
                <span className="text-[11.5px] text-muted-foreground">=</span>
                <span className="truncate text-[13px] text-foreground">{setting.data.value}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete setting ${setting.data.key}`}
                onClick={() => setDeleting(setting.recordId)}
                className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive [&_svg]:size-3.5"
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
