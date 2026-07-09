import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        // Focus ring is INSET: an outer ring gets clipped by overflow
        // ancestors (Modal.Body scrolls) and reads as spilling out of the
        // container. Inside the border box it can never overflow.
        'flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
