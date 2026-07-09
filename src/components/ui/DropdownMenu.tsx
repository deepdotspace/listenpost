/**
 * DropdownMenu — lightweight controlled popover menu in the local kit's
 * style. Click-outside + Escape close; keyboard focus stays usable.
 * For option-picking (filters, assign, status) — not for forms.
 *
 * The open menu renders in a portal with `position: fixed`, so it can never
 * be clipped by `overflow` ancestors (table wrappers, scroll containers) —
 * that clipping was a real bug in the keywords/API tables. It flips above
 * the trigger when there's no room below and closes on scroll/resize
 * rather than tracking a stale position.
 */

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MenuContextValue {
  open: boolean
  setOpen: (v: boolean) => void
  triggerRef: RefObject<HTMLButtonElement | null>
  contentRef: RefObject<HTMLDivElement | null>
}

const MenuContext = createContext<MenuContextValue | null>(null)

function useMenu() {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('DropdownMenu.* must be used inside <DropdownMenu>')
  return ctx
}

function Root({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (contentRef.current?.contains(t)) return
      setOpen(false)
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
    <MenuContext.Provider value={{ open, setOpen, triggerRef, contentRef }}>
      <div className={cn('relative inline-block', className)}>{children}</div>
    </MenuContext.Provider>
  )
}

interface TriggerProps extends ComponentProps<'button'> {
  /** Render a chevron that flips when open (default true). */
  chevron?: boolean
  active?: boolean
}

function Trigger({ chevron = true, active, className, children, ...props }: TriggerProps) {
  const { open, setOpen, triggerRef } = useMenu()
  return (
    <button
      ref={triggerRef}
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

const VIEWPORT_MARGIN = 8
const TRIGGER_GAP = 6

function Content({
  className,
  align = 'start',
  children,
}: {
  className?: string
  align?: 'start' | 'end'
  children: ReactNode
}) {
  const { open, setOpen, triggerRef, contentRef } = useMenu()
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Position after first paint of the portal (needs the menu's real size).
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const trigger = triggerRef.current
    const content = contentRef.current
    if (!trigger || !content) return

    const r = trigger.getBoundingClientRect()
    const cw = content.offsetWidth
    const ch = content.offsetHeight

    let left = align === 'end' ? r.right - cw : r.left
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - cw - VIEWPORT_MARGIN))

    // Open downward; flip above the trigger when there's no room.
    let top = r.bottom + TRIGGER_GAP
    if (top + ch > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, r.top - ch - TRIGGER_GAP)
    }

    setPos({ top, left })
  }, [open, align, triggerRef, contentRef])

  // A fixed-position menu would drift from its trigger on scroll — close instead.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, { capture: true, passive: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
    }
  }, [open, setOpen])

  if (!open) return null

  return createPortal(
    <div
      ref={contentRef}
      role="menu"
      style={{
        position: 'fixed',
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className={cn(
        'z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-[0_4px_20px_0_rgba(0,0,0,0.1)]',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
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
