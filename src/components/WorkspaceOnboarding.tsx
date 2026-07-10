/**
 * WorkspaceOnboarding — the create-first-workspace screen.
 *
 * Rendered by _app.tsx INSTEAD of the routed outlet when a signed-in user
 * hits a protected page with no workspace yet (we never mount a `ws:` scope
 * with a null id). Clean centered card, PageHeader-free.
 */

import { useState, type FormEvent } from 'react'
import { Radar } from 'lucide-react'
import { Button, Input, useToast } from '@/components/ui'
import { useWorkspace } from './WorkspaceProvider'

export function WorkspaceOnboarding() {
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
      // createWorkspace auto-selects — _app.tsx swaps this screen for the
      // ws-scoped outlet as soon as the record lands in the local store.
      await createWorkspace(name, context)
    } catch (err) {
      error('Could not create workspace', String(err))
      setCreating(false)
    }
  }

  return (
    <main className="flex h-full items-center justify-center overflow-y-auto bg-background px-4">
      <div className="w-full max-w-[420px]">
        {/* Brand mark */}
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-primary">
            <Radar className="h-[17px] w-[17px] text-primary-foreground" aria-hidden />
          </span>
          <span className="text-[17px] font-bold tracking-tight text-foreground">Octolens</span>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-6 shadow-card">
          <h1 className="text-[16px] font-semibold tracking-tight text-foreground">
            Create your workspace
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Keywords, mentions, and alerts live inside a workspace. Invite your team later from
            the sidebar.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="workspace-name"
                className="block font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-tertiary"
              >
                Workspace name
              </label>
              <Input
                id="workspace-name"
                data-testid="workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Inc"
                autoFocus
                className="h-9 bg-background text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="workspace-context"
                className="block font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-tertiary"
              >
                Brand context <span className="font-sans normal-case text-tertiary">(optional)</span>
              </label>
              <textarea
                id="workspace-context"
                data-testid="workspace-context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={3}
                placeholder="What you sell, who it's for — helps the AI judge relevance."
                className="flex w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/15"
              />
            </div>

            <Button
              type="submit"
              data-testid="create-workspace"
              disabled={!name.trim()}
              loading={creating}
              className="h-9 w-full text-[13px]"
            >
              Create workspace
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center font-mono text-[10.5px] text-tertiary">
          One workspace per brand — you can create more anytime.
        </p>
      </div>
    </main>
  )
}
