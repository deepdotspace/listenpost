/**
 * Settings — account details + appearance (theme picker over the catalog
 * in src/themes.ts). No auth logic lives here because
 * (protected)/_layout.tsx already wraps the subtree in <AuthGate>.
 */

import { useEffect, useState } from 'react'
import { signOut, useUser } from 'deepspace'
import { Check } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import { PageHeader, SectionLabel } from '../../components/PageHeader'
import { THEMES, getActiveTheme, type ThemeId } from '../../themes'

const THEME_STORAGE_KEY = 'octolens-theme'

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
      <PageHeader title="Settings" />

      <div className="flex-1 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Account */}
          <section className="space-y-2">
            <SectionLabel>Account</SectionLabel>
            <div className="divide-y divide-border rounded-lg border border-border bg-card/50">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[11.5px] text-muted-foreground">Name</span>
                <span className="text-[13px] text-foreground">{user?.name ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[11.5px] text-muted-foreground">Email</span>
                <span className="text-[13px] text-foreground">{user?.email ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[11.5px] text-muted-foreground">Session</span>
                <Button size="sm" variant="outline" onClick={() => signOut()} className="h-7 px-2.5 text-xs">
                  Sign out
                </Button>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="space-y-2">
            <SectionLabel>Appearance</SectionLabel>
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <p className="mb-3 text-[11.5px] text-muted-foreground">
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
                        'flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
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
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
