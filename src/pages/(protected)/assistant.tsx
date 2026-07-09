/**
 * Assistant — full-page AI chat over the workspace's mentions data.
 *
 * Layout:
 *   PageHeader ("Assistant" · history toggle + new chat)
 *   [ conversations rail (collapsible) | chat surface (fills the page) ]
 *
 * The chat IS the page: ChatPanel fills the remaining height and centers
 * its message column (max-w-[44rem]) like modern chat apps. Conversation
 * history lives in a collapsible left rail inside the page — toggled from
 * the header — with per-row select/delete. The active chat's title is
 * editable in a slim row above the messages.
 *
 * All chat wiring (chatId lifecycle, eager create, onChatCreated, delete /
 * rename endpoints) is unchanged from the previous implementation — this
 * is a restyle + layout fix only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { History, Pencil, Plus, X } from 'lucide-react'
import { useAuth, AuthOverlay, getAuthToken, useQuery } from 'deepspace'
// Paths resolve post-install (page → src/pages/, components → src/components/).
import { ChatPanel } from '../../components/ChatPanel'
import { PageHeader, SectionLabel } from '../../components/PageHeader'

interface ChatRow {
  userId: string
  title?: string
}

/** Octolens-specific starter prompts for the empty state. */
const SUGGESTED_PROMPTS = [
  'What are people saying about my keywords this week?',
  'Summarize negative mentions',
  'Which source has the most buying intent?',
]

// Compact relative timestamp: now / 5m / 3h / 2d / 3w. Falls back to '' when
// the input isn't a parseable ISO string.
function formatRelative(ts?: string): string {
  if (!ts) return ''
  const t = Date.parse(ts)
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, Date.now() - t)
  if (diff < 60_000) return 'now'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return `${Math.floor(d / 7)}w`
}

export default function AiChatPage() {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)

  const [railOpen, setRailOpen] = useState(false)
  const [creatingChat, setCreatingChat] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const { records: chatsRaw } = useQuery<ChatRow>('ai-chats', {
    where: { userId: userId ?? '__none__' },
    orderBy: 'updatedAt',
    orderDir: 'desc',
    limit: 50,
  })

  // Re-sort newest-first on the client. The SDK's useQuery applies orderBy
  // server-side at the initial fetch but appends WebSocket-broadcasted
  // inserts to the tail of the local cache, so without this a freshly-
  // created chat would land at the bottom until the next page refresh.
  const chats = useMemo(() => {
    return [...chatsRaw].sort((a, b) => {
      const aT = Date.parse(a.updatedAt ?? a.createdAt ?? '') || 0
      const bT = Date.parse(b.updatedAt ?? b.createdAt ?? '') || 0
      return bT - aT
    })
  }, [chatsRaw])

  const activeChat = useMemo(
    () => chats.find((c) => c.recordId === activeChatId) ?? null,
    [chats, activeChatId],
  )
  const activeTitle = (activeChat?.data.title ?? '').trim() || (activeChatId ? 'Untitled' : 'New chat')

  const handleSelect = useCallback((id: string) => {
    setActiveChatId(id)
  }, [])

  const handleNew = useCallback(async () => {
    // Eager create: row appears in the rail at click-time. We set chatId
    // to null up front so the panel renders the empty state immediately,
    // and flip `creatingChat` so the panel's input is suspended — without
    // that gate a fast typist could send before our POST resolves and the
    // panel would also auto-create, spawning a second chat.
    setActiveChatId(null)
    setCreateError(null)
    setCreatingChat(true)
    try {
      const token = await getAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch('/api/ai/chats', { method: 'POST', headers })
      if (!res.ok) throw new Error(`create chat failed: ${res.status}`)
      const data = (await res.json()) as { chat?: { id?: string } }
      if (data.chat?.id) setActiveChatId(data.chat.id)
    } catch (err) {
      console.error('[ai-chat-page] create chat failed:', err)
      setCreateError(err instanceof Error ? err.message : 'Failed to create chat')
    } finally {
      setCreatingChat(false)
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    // Don't clear `activeChatId` until the DELETE actually succeeds: if it
    // fails, the row stays in the user's rail (because useQuery still
    // reflects it server-side) and we don't want the UI to mislead the user
    // into thinking it's gone. The chat-switch effect in ChatPanel aborts
    // any in-flight stream when activeChatId flips id→null, so the orphan
    // assistant write we'd otherwise produce on cascade-delete is prevented
    // by F1 (abort on id→null) — not by ordering this call before the fetch.
    try {
      const token = await getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`/api/ai/chats/${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(`delete failed: ${res.status}`)
      setActiveChatId((cur) => (cur === id ? null : cur))
    } catch (err) {
      console.error('[ai-chat-page] delete failed:', err)
      setCreateError(err instanceof Error ? `Couldn't delete chat: ${err.message}` : "Couldn't delete chat")
    }
  }, [])

  const handleRename = useCallback(async (id: string, title: string) => {
    try {
      const token = await getAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`/api/ai/chats/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error(`rename failed: ${res.status}`)
    } catch (err) {
      console.error('[ai-chat-page] rename failed:', err)
    }
  }, [])

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!isSignedIn || !userId) {
    return (
      <>
        <div className="flex h-full items-center justify-center px-4">
          <div className="max-w-sm space-y-3 text-center">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Sign in to use the assistant
            </h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              The AI assistant inspects live app data using your permissions.
            </p>
            <button
              onClick={() => setShowAuth(true)}
              className="rounded-md bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in
            </button>
          </div>
        </div>
        {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Assistant"
        meta={<span className="truncate">Ask anything about your mentions</span>}
        actions={
          <>
            <span className="mr-1 hidden items-center gap-1.5 rounded-[7px] border border-input px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              Claude · Sonnet
            </span>
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              aria-pressed={railOpen}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                railOpen
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              History
            </button>
            <button
              type="button"
              onClick={() => { void handleNew() }}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New chat
            </button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        {railOpen && (
          <ConversationRail
            chats={chats}
            activeChatId={activeChatId}
            onSelect={handleSelect}
            onDelete={handleDelete}
          />
        )}

        <div className="min-w-0 flex-1">
          <ChatPanel
            chatId={activeChatId}
            userId={userId}
            onChatCreated={setActiveChatId}
            disabled={creatingChat}
            emptyStatePrompts={SUGGESTED_PROMPTS}
            compact
            header={
              <>
                {activeChatId && (
                  <div className="px-4 pt-2">
                    <div className="mx-auto max-w-[764px]">
                      <ChatTitleBar chatId={activeChatId} title={activeTitle} onRename={handleRename} />
                    </div>
                  </div>
                )}
                {createError && (
                  <div className="px-4 pt-2">
                    <div
                      role="alert"
                      className="mx-auto max-w-[764px] rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive"
                    >
                      <div className="flex items-start gap-2">
                        <span className="flex-1 leading-relaxed">{createError}</span>
                        <button
                          type="button"
                          onClick={() => { void handleNew() }}
                          className="rounded-md border border-destructive/30 px-2 py-0.5 text-[12px] font-medium hover:bg-destructive/10"
                        >
                          Retry
                        </button>
                        <button
                          type="button"
                          onClick={() => setCreateError(null)}
                          aria-label="Dismiss"
                          className="rounded-md px-1 text-[14px] leading-none hover:bg-destructive/10"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            }
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Conversation rail — collapsible left panel with the user's chat history.
// Select switches the active chat; the × on hover deletes.
// ============================================================================

function ConversationRail({
  chats, activeChatId, onSelect, onDelete,
}: {
  chats: Array<{ recordId: string; data: ChatRow; createdAt?: string; updatedAt?: string }>
  activeChatId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => Promise<void>
}) {
  return (
    <aside
      aria-label="Conversation history"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-card/50"
    >
      <div className="shrink-0 px-3 pb-1 pt-3">
        <SectionLabel>Conversations</SectionLabel>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {chats.length === 0 ? (
          <div className="px-1 py-1 text-[12px] text-muted-foreground">
            No previous conversations.
          </div>
        ) : (
          chats.map((chat) => (
            <ChatHistoryRow
              key={chat.recordId}
              title={chat.data.title}
              timestamp={formatRelative(chat.updatedAt ?? chat.createdAt)}
              active={chat.recordId === activeChatId}
              onSelect={() => onSelect(chat.recordId)}
              onDelete={() => onDelete(chat.recordId)}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function ChatHistoryRow({
  title, timestamp, active, onSelect, onDelete,
}: {
  title?: string
  timestamp: string
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const display = (title ?? '').trim() || 'Untitled'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() }
      }}
      className={`group relative flex w-full shrink-0 cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/20 ${
        active
          ? 'border-border/60 bg-accent'
          : 'hover:bg-secondary'
      }`}
    >
      <span
        className={`min-w-0 flex-1 truncate text-[12.5px] ${
          active ? 'font-medium text-foreground' : 'text-muted-foreground group-hover:text-foreground'
        }`}
      >
        {display}
      </span>
      {timestamp && (
        <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground/70 group-hover:hidden">
          {timestamp}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        aria-label={`Delete ${display}`}
        tabIndex={-1}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:inline-flex"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  )
}

// ============================================================================
// Editable title row — sits above the messages, centered on the chat column.
// ============================================================================

function ChatTitleBar({
  chatId, title, onRename,
}: {
  chatId: string
  title: string
  onRename: (id: string, title: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync draft to the latest title — but skip while the user is actively
  // editing, otherwise an incoming server-side rename (e.g. auto-title) would
  // clobber their in-progress text under the cursor.
  useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function commit() {
    if (!editing) return
    setEditing(false)
    const next = draft.trim()
    if (next && next !== title) void onRename(chatId, next)
    else setDraft(title)
  }

  if (editing) {
    return (
      <div className="flex h-8 min-w-0 items-center">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(title); setEditing(false) }
          }}
          className="block w-full bg-transparent text-[13px] font-medium text-foreground outline-none"
        />
      </div>
    )
  }

  return (
    <div className="flex h-8 min-w-0 items-center">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Rename chat"
        className="group inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5"
      >
        <span className="min-w-0 truncate text-[13px] font-medium text-foreground/85">
          {title}
        </span>
        <Pencil
          className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          aria-hidden
        />
      </button>
    </div>
  )
}
