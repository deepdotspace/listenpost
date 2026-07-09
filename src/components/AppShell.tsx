/**
 * AppShell — the product chrome: fixed left sidebar (grouped nav, brand,
 * user) + independently scrolling content column. Mobile gets a compact
 * top bar with a slide-over drawer.
 *
 * Pages own their header row via <PageHeader>; the shell owns navigation
 * and identity only.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, signOut } from 'deepspace'
import { ArrowUpRight, LogOut, Menu, Radar, X } from 'lucide-react'
import { ROLE_CONFIG, type Role } from '../constants'
import { navGroups } from '../nav'
import { cn } from '../lib/utils'

export default function AppShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const profileReady = !isSignedIn || (!userLoading && !!user)
  const userRole = (user?.role ?? 'anonymous') as Role | 'anonymous'

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
    <div className="flex h-full flex-col">
      {/* Brand */}
      <Link to="/mentions" className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-inset ring-primary/25">
          <Radar className="h-4 w-4 text-primary" aria-hidden />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Octolens</span>
      </Link>

      {/* Nav groups */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 pb-4 pt-2">
        {groups.map((g) => (
          <div key={g.label ?? 'top'}>
            {g.label && (
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                {g.label}
              </div>
            )}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = location.pathname.startsWith(item.path)
                const Icon = item.icon
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        active ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-muted-foreground',
                      )}
                      aria-hidden
                    />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: upgrade + identity */}
      <div className="shrink-0 space-y-2 border-t border-border p-2.5">
        <Link
          to="/pricing"
          className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <span>Plans &amp; usage</span>
          <ArrowUpRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </Link>
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
        className="hidden w-[228px] shrink-0 border-r border-border bg-card/40 lg:block"
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
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Radar className="h-4 w-4 text-primary" aria-hidden />
          Octolens
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
        <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border">
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
            className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-[0_4px_16px_0_rgba(0,0,0,0.4)]"
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
