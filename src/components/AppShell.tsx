/**
 * AppShell — the product chrome: fixed left sidebar (grouped nav, brand,
 * user) + independently scrolling content column. Mobile gets a compact
 * top bar with a slide-over drawer.
 *
 * Pages own their header row via <PageHeader>; the shell owns navigation
 * and identity only.
 */

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, signOut, useQuery, useSubscription } from 'deepspace'
import { ArrowUpRight, LogOut, Menu, Plus, Radar, Trash2, Users, X } from 'lucide-react'
import { Button, ConfirmModal, DropdownMenu, Input, Modal, useToast } from '@/components/ui'
import { ROLE_CONFIG, type Role } from '../constants'
import { navGroups } from '../nav'
import { PLAN_QUOTAS, subscriptionPlans, type SubscriptionPlanSlug } from '../subscriptions'
import { cn } from '../lib/utils'
import { useWorkspace } from './WorkspaceProvider'

export default function AppShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const { currentId } = useWorkspace()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const profileReady = !isSignedIn || (!userLoading && !!user)
  const userRole = (user?.role ?? 'anonymous') as Role | 'anonymous'

  // Live counts for the Mentions nav badge + usage card. Fetched only when
  // signed in (a signed-out `mentions` query 401s and pollutes the console).
  const [counts, setCounts] = useState({ newCount: 0, used: 0 })

  useEffect(() => setDrawerOpen(false), [location.pathname])

  const groups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (item.devOnly && !import.meta.env.DEV) return false
        if (!item.roles) return true
        if (!profileReady) return false
        if (userRole === 'admin') return true
        return item.roles.includes(userRole as Role)
      }),
    }))
    .filter((g) => g.items.length > 0)

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Brand */}
      <Link
        to="/mentions"
        className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4"
      >
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-primary">
          <Radar className="h-[15px] w-[15px] text-primary-foreground" aria-hidden />
        </span>
        <span className="text-[15px] font-bold tracking-tight text-foreground">Listenpost</span>
        <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium text-tertiary">
          v2
        </span>
      </Link>

      {/* Workspace switcher — tenancy selector, above the nav groups */}
      {isSignedIn && <WorkspaceSwitcher />}

      {/* Nav groups */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 pb-4 pt-3">
        {groups.map((g) => (
          <div key={g.label ?? 'top'}>
            {g.label && (
              <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-tertiary">
                {g.label}
              </div>
            )}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = location.pathname.startsWith(item.path)
                const Icon = item.icon
                const badge = item.path === '/mentions' && counts.newCount > 0 ? counts.newCount : null
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-[7px] px-2 py-[7px] text-[13px] transition-colors',
                      active
                        ? 'bg-primary/[0.08] font-semibold text-primary'
                        : 'font-medium text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        active ? 'text-primary' : 'text-tertiary group-hover:text-muted-foreground',
                      )}
                      aria-hidden
                    />
                    {item.label}
                    {badge != null && (
                      <span
                        className={cn(
                          'ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-accent text-muted-foreground',
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: usage card + identity. SidebarData counts the WORKSPACE
          room's mentions — AppShell mounts inside the ws:<id> RecordScope
          (see _app.tsx), so it only renders once a workspace is selected. */}
      <div className="shrink-0 space-y-2.5 border-t border-border p-2.5">
        {isSignedIn && profileReady && currentId && <SidebarData onCounts={setCounts} />}
        <UserRow
          isLoaded={isLoaded}
          isSignedIn={!!isSignedIn}
          profileReady={profileReady}
          user={user}
          userRole={userRole}
          onSignIn={() => setShowAuthModal(true)}
        />
      </div>
    </div>
  )

  return (
    <div className="flex h-full min-h-0">
      {/* Desktop sidebar */}
      <aside
        data-testid="app-navigation"
        className="hidden w-[236px] shrink-0 border-r border-border lg:block"
      >
        {sidebar}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-md lg:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Menu className="h-4.5 w-4.5" aria-hidden />
        </button>
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-primary">
            <Radar className="h-[13px] w-[13px] text-primary-foreground" aria-hidden />
          </span>
          Listenpost
        </span>
      </div>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[260px] border-r border-border bg-background shadow-2xl">
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-2 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      {/* Content column */}
      <main className="min-w-0 flex-1 overflow-y-auto pt-12 lg:pt-0">{children}</main>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}

// ─── Workspace switcher ──────────────────────────────────────────────────────

/**
 * Current-workspace pill + dropdown: switch, create, and (owner) manage
 * members. Lives above the nav groups; matches the sidebar's 13px compact
 * look. All data comes from WorkspaceProvider (app-room scope).
 */
function WorkspaceSwitcher() {
  const { workspaces, current, currentId, isOwner, select } = useWorkspace()
  const [createOpen, setCreateOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const name = current?.data.name ?? 'No workspace'
  const initial = (current?.data.name?.[0] ?? '?').toUpperCase()

  return (
    <div className="shrink-0 border-b border-border px-2.5 py-2">
      <DropdownMenu className="block">
        <DropdownMenu.Trigger
          chevron
          data-testid="workspace-switcher"
          className="h-auto w-full justify-start gap-2 rounded-[7px] border-transparent px-2 py-[6px] hover:bg-secondary"
        >
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-primary/[0.08] font-mono text-[11px] font-bold text-primary">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-foreground">
            {name}
          </span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content className="w-[212px]">
          <DropdownMenu.Label>Workspaces</DropdownMenu.Label>
          {workspaces.map((w) => (
            <DropdownMenu.Item
              key={w.recordId}
              selected={w.recordId === currentId}
              onClick={() => select(w.recordId)}
            >
              {w.data.name}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator />
          <DropdownMenu.Item data-testid="workspace-create-item" onClick={() => setCreateOpen(true)}>
            <span className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-tertiary" aria-hidden />
              Create workspace
            </span>
          </DropdownMenu.Item>
          {isOwner && (
            <>
              <DropdownMenu.Item
                data-testid="workspace-members-item"
                onClick={() => setMembersOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-tertiary" aria-hidden />
                  Manage members
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                data-testid="workspace-delete-item"
                onClick={() => setDeleteOpen(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete workspace
                </span>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>

      <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ManageMembersModal open={membersOpen} onClose={() => setMembersOpen(false)} />
      <DeleteWorkspaceModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  )
}

/**
 * Owner-only, type-to-confirm workspace deletion. Deletion is PERMANENT:
 * the server action removes the registry row and purges the tenant room
 * (keywords, mentions, alerts, digests, webhooks) — so the confirm gate
 * requires typing the workspace name, not just a button click.
 */
function DeleteWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { current, deleteWorkspace } = useWorkspace()
  const { success, error } = useToast()
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)

  const name = current?.data.name ?? ''
  const nameMatches = typed.trim() === name && name.length > 0

  function close() {
    setTyped('')
    onClose()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nameMatches || deleting) return
    setDeleting(true)
    const result = await deleteWorkspace()
    setDeleting(false)
    if (result.ok) {
      close()
      success('Workspace deleted', 'All of its data is being cleared.')
    } else {
      error('Delete failed', result.error)
    }
  }

  return (
    <Modal open={open} onClose={close} size="sm">
      <Modal.Header onClose={close}>
        <Modal.Title className="text-[15px]">Delete {name}?</Modal.Title>
        <Modal.Description className="text-[13px]">
          This <span className="font-semibold text-foreground">permanently deletes</span> the
          workspace and all of its data — every keyword, mention, alert, digest, and webhook.
          Members lose access immediately. This cannot be undone.
        </Modal.Description>
      </Modal.Header>
      <form onSubmit={onSubmit}>
        <Modal.Body className="space-y-2">
          <label htmlFor="delete-workspace-confirm" className="block text-[12px] text-muted-foreground">
            Type <span className="font-semibold text-foreground">{name}</span> to confirm
          </label>
          <Input
            id="delete-workspace-confirm"
            data-testid="delete-workspace-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={name}
            autoFocus
            autoComplete="off"
            className="h-9 text-[13px]"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={close} disabled={deleting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            data-testid="delete-workspace-submit"
            disabled={!nameMatches}
            loading={deleting}
          >
            Delete workspace
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}

/** Small inline create form — same testids as the first-run onboarding card
 *  (the two are never mounted at the same time). */
function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createWorkspace } = useWorkspace()
  const { error } = useToast()
  const [name, setName] = useState('')
  const [context, setContext] = useState('')
  const [creating, setCreating] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await createWorkspace(name, context)
      setName('')
      setContext('')
      onClose()
    } catch (err) {
      error('Could not create workspace', String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header onClose={onClose}>
        <Modal.Title className="text-[15px]">Create workspace</Modal.Title>
        <Modal.Description className="text-[13px]">
          A separate tenant: its own keywords, mentions, and alerts.
        </Modal.Description>
      </Modal.Header>
      <form onSubmit={onSubmit}>
        <Modal.Body className="space-y-3.5">
          <Input
            data-testid="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            autoFocus
            className="h-9 text-[13px]"
          />
          <textarea
            data-testid="workspace-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            placeholder="Brand context (optional)"
            className="flex w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-[13px] leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/15"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            type="submit"
            data-testid="create-workspace"
            disabled={!name.trim()}
            loading={creating}
          >
            Create
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}

/** Owner-only member management: list, invite by email, remove. Exported so
 *  the admin page's "Invite" button opens the same flow as the switcher. */
export function ManageMembersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { current, members, inviteByEmail, removeMember } = useWorkspace()
  const { success, error } = useToast()
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{ id: string; label: string } | null>(null)
  const [removing, setRemoving] = useState(false)

  async function onInvite(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || inviting) return
    setInviting(true)
    const result = await inviteByEmail(email)
    setInviting(false)
    if (result.ok) {
      setEmail('')
      success('Member added', 'They can open this workspace now.')
    } else {
      error('Invite failed', result.error)
    }
  }

  async function onConfirmRemove() {
    if (!removeTarget || removing) return
    setRemoving(true)
    const result = await removeMember(removeTarget.id)
    setRemoving(false)
    setRemoveTarget(null)
    if (result.ok) success('Member removed')
    else error('Remove failed', result.error)
  }

  return (
    <>
      <Modal open={open} onClose={onClose} size="sm">
        <Modal.Header onClose={onClose}>
          <Modal.Title className="text-[15px]">Members</Modal.Title>
          <Modal.Description className="text-[13px]">
            People with access to <span className="text-foreground">{current?.data.name}</span>.
          </Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <form onSubmit={onInvite} className="flex gap-2">
            <Input
              data-testid="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="h-9 text-[13px]"
            />
            <Button
              type="submit"
              data-testid="invite-submit"
              disabled={!email.trim()}
              loading={inviting}
              className="h-9 shrink-0 px-3 text-[12.5px]"
            >
              Invite
            </Button>
          </form>

          <div className="divide-y divide-border rounded-lg border border-border">
            {members.map((m) => (
              <div key={m.id} data-testid="member-row" className="flex items-center gap-2.5 px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/[0.08] text-[10px] font-bold text-primary">
                  {(m.name?.[0] ?? m.email?.[0] ?? '?').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {m.name || m.email || m.id}
                  </span>
                  {m.email && m.name && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {m.email}
                    </span>
                  )}
                </span>
                {m.isOwner ? (
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium text-tertiary">
                    owner
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid="remove-member"
                    aria-label={`Remove ${m.name || m.email || 'member'}`}
                    onClick={() => setRemoveTarget({ id: m.id, label: m.name || m.email || m.id })}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Modal.Body>
      </Modal>

      <ConfirmModal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={onConfirmRemove}
        title="Remove member?"
        description={`${removeTarget?.label ?? 'This member'} will lose access to this workspace immediately.`}
        confirmText="Remove"
        loading={removing}
      />
    </>
  )
}

// ─── Sidebar data (mounted only when signed in) ──────────────────────────────

/**
 * Owns the authed `mentions` / subscription reads so they never fire for a
 * signed-out visitor (which would 401). Reports counts up for the nav badge
 * and renders the usage card.
 */
function SidebarData({ onCounts }: { onCounts: (c: { newCount: number; used: number }) => void }) {
  const sub = useSubscription()
  const { records: mentions } = useQuery<{ status?: string }>('mentions', { limit: 500 })

  const newCount = useMemo(
    () => (mentions ?? []).filter((r) => (r.data.status ?? 'new') === 'new').length,
    [mentions],
  )
  const used = mentions?.length ?? 0

  useEffect(() => {
    onCounts({ newCount, used })
  }, [newCount, used, onCounts])

  return <UsageCard used={used} tier={sub?.tier as SubscriptionPlanSlug | undefined} />
}

// ─── Usage card ──────────────────────────────────────────────────────────────

function UsageCard({ used, tier }: { used: number; tier: SubscriptionPlanSlug | undefined }) {
  const slug: SubscriptionPlanSlug = tier ?? 'free'
  const plan = subscriptionPlans.find((p) => p.slug === slug)
  const quota = PLAN_QUOTAS[slug]
  const pct = Math.min(100, quota > 0 ? Math.round((used / quota) * 100) : 0)

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-foreground">{plan?.name ?? 'Trial'} plan</span>
        <Link
          to="/pricing"
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:text-primary/80"
        >
          Upgrade
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 font-mono text-[10.5px] tabular-nums text-tertiary">
        {used.toLocaleString()} / {quota.toLocaleString()} mentions
      </p>
    </div>
  )
}

// ─── Identity row ────────────────────────────────────────────────────────────

interface UserRowProps {
  isLoaded: boolean
  isSignedIn: boolean
  profileReady: boolean
  user: { name?: string; email?: string; imageUrl?: string } | null | undefined
  userRole: Role | 'anonymous'
  onSignIn: () => void
}

function UserRow({ isLoaded, isSignedIn, profileReady, user, userRole, onSignIn }: UserRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const roleConfig =
    ROLE_CONFIG[userRole as Role] ?? { title: 'Anonymous', badgeVariant: 'secondary' }

  if (!isLoaded) {
    return <div className="h-11 animate-pulse rounded-md bg-muted" />
  }

  if (isSignedIn && !profileReady) {
    return (
      <div data-testid="nav-role-loading" className="flex items-center gap-2 rounded-md px-2 py-1.5">
        <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
        <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (!isSignedIn || !user) {
    return (
      <button
        data-testid="nav-sign-in-button"
        onClick={onSignIn}
        className="w-full rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Sign in
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/[0.08] text-[11px] font-semibold text-primary">
          {user.imageUrl ? (
            <img src={user.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full object-cover" />
          ) : (
            (user.name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span data-testid="nav-user-name" className="block truncate text-[13px] font-medium text-foreground">
            {user.name || user.email}
          </span>
          <span data-testid="nav-role-badge" className="block truncate text-[11px] text-muted-foreground">
            {roleConfig.title}
          </span>
        </span>
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-[0_4px_20px_0_rgba(0,0,0,0.08)]"
          >
            <div className="border-b border-border px-3 py-2">
              <div className="truncate text-[13px] font-medium text-foreground">{user.name || 'Signed in'}</div>
              <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
            </div>
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                signOut()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
