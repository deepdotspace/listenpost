/**
 * Settings — account details + appearance (theme picker over the catalog
 * in src/themes.ts). No auth logic lives here because
 * (protected)/_layout.tsx already wraps the subtree in <AuthGate>.
 */

import { useEffect, useState } from 'react'
import { signOut, useUser } from 'deepspace'
import { Check } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import { PageHeader } from '../../components/PageHeader'
import { THEMES, getActiveTheme, type ThemeId } from '../../themes'

const THEME_STORAGE_KEY = 'listenpost-theme'

export default function SettingsPage() {
  const { user } = useUser()
  const [activeTheme, setActiveTheme] = useState<ThemeId>(getActiveTheme)

  // Restore a previously picked theme on mount.
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored && THEMES.some((t) => t.id === stored)) {
      document.documentElement.dataset.theme = stored
      setActiveTheme(stored as ThemeId)
    }
  }, [])

  function applyTheme(id: ThemeId) {
    document.documentElement.dataset.theme = id
    localStorage.setItem(THEME_STORAGE_KEY, id)
    setActiveTheme(id)
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Settings" meta={<span>Workspace preferences</span>} />

      <div className="flex-1 px-4 py-5 sm:px-5">
        <div className="flex max-w-[720px] flex-col gap-4">
          {/* Account */}
          <section className="rounded-xl border border-border bg-card p-[18px] shadow-card">
            <div className="mb-3.5 text-[13px] font-semibold text-foreground">Account</div>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">Name</label>
                <div className="flex h-9 items-center rounded-lg border border-input bg-background px-[11px] text-[13px] text-foreground">
                  {user?.name ?? '—'}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">Email</label>
                <div className="flex h-9 items-center rounded-lg border border-input bg-background px-[11px] text-[13px] text-foreground">
                  {user?.email ?? '—'}
                </div>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="rounded-xl border border-border bg-card p-[18px] shadow-card">
            <div className="mb-1 text-[13px] font-semibold text-foreground">Appearance</div>
            <p className="mb-3.5 text-[11.5px] text-tertiary">
              Theme applies immediately and is remembered on this device.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEMES.map((t) => {
                const active = t.id === activeTheme
                return (
                  <button
                    key={t.id}
                    type="button"
                    title={t.description}
                    aria-pressed={active}
                    onClick={() => applyTheme(t.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                      active
                        ? 'border-primary/50 bg-primary/[0.08]'
                        : 'border-border hover:bg-secondary',
                    )}
                  >
                    {/* Swatch — scoped to the theme's own tokens via data-theme. */}
                    <span
                      data-theme={t.id}
                      aria-hidden
                      className="flex h-5 w-8 shrink-0 items-center justify-center rounded border border-border bg-background"
                    >
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                      {t.label}
                    </span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Session — the one destructive action available here. */}
          <section className="rounded-xl border border-destructive/30 bg-destructive/[0.04] p-[18px]">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-destructive">Sign out</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                  End this session on this device. You can sign back in anytime.
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => signOut()}
                className="h-8 shrink-0 border-destructive/50 px-3 text-[12.5px] font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Sign out
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
