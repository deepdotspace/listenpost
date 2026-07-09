/**
 * DropdownMenu — lightweight controlled popover menu in the local kit's
 * style. Click-outside + Escape close; keyboard focus stays usable.
 * For option-picking (filters, assign, status) — not for forms.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MenuContextValue {
  open: boolean
  setOpen: (v: boolean) => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

function useMenu() {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('DropdownMenu.* must be used inside <DropdownMenu>')
  return ctx
}

function Root({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <MenuContext.Provider value={{ open, setOpen }}>
      <div ref={ref} className={cn('relative inline-block', className)}>
        {children}
      </div>
    </MenuContext.Provider>
  )
}

interface TriggerProps extends ComponentProps<'button'> {
  /** Render a chevron that flips when open (default true). */
  chevron?: boolean
  active?: boolean
}

function Trigger({ chevron = true, active, className, children, ...props }: TriggerProps) {
  const { open, setOpen } = useMenu()
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
      {chevron && (
        <ChevronDown
          className={cn('h-3 w-3 opacity-60 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      )}
    </button>
  )
}

function Content({
  className,
  align = 'start',
  children,
}: {
  className?: string
  align?: 'start' | 'end'
  children: ReactNode
}) {
  const { open } = useMenu()
  if (!open) return null
  return (
    <div
      role="menu"
      className={cn(
        'absolute z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-[0_4px_16px_0_rgba(0,0,0,0.4)]',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface ItemProps extends ComponentProps<'button'> {
  selected?: boolean
  /** Keep the menu open after click (default false). */
  keepOpen?: boolean
}

function Item({ selected, keepOpen, className, children, onClick, ...props }: ItemProps) {
  const { setOpen } = useMenu()
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        onClick?.(e)
        if (!keepOpen) setOpen(false)
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
        selected ? 'text-foreground' : 'text-muted-foreground',
        'hover:bg-secondary hover:text-foreground',
        className,
      )}
      {...props}
    >
      <span className="flex-1 truncate">{children}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
    </button>
  )
}

function Separator() {
  return <div className="my-1 h-px bg-border" role="separator" />
}

function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </div>
  )
}

export const DropdownMenu = Object.assign(Root, {
  Trigger,
  Content,
  Item,
  Separator,
  Label: MenuLabel,
})
