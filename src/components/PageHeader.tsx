/**
 * PageHeader — the one page-title treatment every app page uses.
 * Compact (console, not marketing site): 15px semibold title, meta line,
 * right-aligned actions. Pages render content directly below, full width
 * of the shell's content column.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: ReactNode
  /** Small muted line under or beside the title (counts, live status). */
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6',
        className,
      )}
    >
      <h1 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h1>
      {meta && <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">{meta}</div>}
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  )
}

/** Uppercase micro-label used for section headings inside pages. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </h2>
  )
}
