/**
 * Keywords — monitor management. Create/edit/delete the terms the app
 * crawls for, with per-keyword brand context that tunes AI scoring.
 */

import { useMemo, useState } from 'react'
import { useQuery, useMutations, useUser } from 'deepspace'
import { Button, Badge, Input, Modal, ConfirmModal, EmptyState, useToast } from '@/components/ui'
import type { Keyword, KeywordType } from '../../types'

const KEYWORD_TYPES: { id: KeywordType; label: string }[] = [
  { id: 'brand', label: 'Brand' },
  { id: 'feature', label: 'Feature' },
  { id: 'competitor', label: 'Competitor' },
  { id: 'pain_point', label: 'Pain point' },
]

/** Sources selectable per keyword. Grows as ingestion sources ship. */
const AVAILABLE_SOURCES: { id: string; label: string }[] = [
  { id: 'hackernews', label: 'Hacker News' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'bluesky', label: 'Bluesky' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'github', label: 'GitHub' },
  { id: 'news', label: 'News' },
  { id: 'web', label: 'Web (Exa)' },
  { id: 'x', label: 'X (partial)' },
  { id: 'linkedin', label: 'LinkedIn (partial)' },
]

const TYPE_BADGE: Record<KeywordType, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  brand: 'default',
  feature: 'secondary',
  competitor: 'destructive',
  pain_point: 'outline',
}

interface EditorState {
  recordId: string | null
  term: string
  keyword_type: KeywordType
  brand_context: string
  sources: string[]
}

const EMPTY_EDITOR: EditorState = {
  recordId: null,
  term: '',
  keyword_type: 'brand',
  brand_context: '',
  sources: ['hackernews'],
}

export default function KeywordsPage() {
  const { records, status } = useQuery<Keyword>('keywords', { orderBy: 'createdAt', orderDir: 'desc' })
  const { create, put, remove } = useMutations<Keyword>('keywords')
  const { user } = useUser()
  const { success, error } = useToast()

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canEdit = user?.role === 'member' || user?.role === 'admin'

  const sorted = useMemo(() => records ?? [], [records])

  async function save() {
    if (!editor || !editor.term.trim()) return
    setSaving(true)
    try {
      const data: Keyword = {
        term: editor.term.trim(),
        keyword_type: editor.keyword_type,
        brand_context: editor.brand_context.trim(),
        sources: editor.sources,
        is_active: 1,
      }
      if (editor.recordId) {
        await put(editor.recordId, data)
        success('Keyword updated')
      } else {
        await create(data)
        success('Keyword added', 'Crawling starts on the next poll cycle.')
      }
      setEditor(null)
    } catch (err) {
      error('Save failed', String(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(recordId: string, isActive: number | undefined) {
    try {
      await put(recordId, { is_active: isActive ? 0 : 1 })
    } catch (err) {
      error('Update failed', String(err))
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove(deleting)
      success('Keyword deleted')
    } catch (err) {
      error('Delete failed', String(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Keywords</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Terms we monitor across sources. Brand context tunes AI relevance scoring.
            </p>
          </div>
          {canEdit && (
            <Button data-testid="add-keyword" onClick={() => setEditor({ ...EMPTY_EDITOR })}>
              Add keyword
            </Button>
          )}
        </div>

        {status === 'loading' && (
          <div className="py-16 text-center text-muted-foreground">Loading…</div>
        )}

        {status !== 'loading' && sorted.length === 0 && (
          <EmptyState
            title="No keywords yet"
            description="Add your brand, features, competitors, or pain points to start monitoring."
          />
        )}

        <ul className="space-y-3" data-testid="keyword-list">
          {sorted.map((r) => {
            const k = r.data
            return (
              <li
                key={r.recordId}
                data-testid="keyword-row"
                className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{k.term}</span>
                    <Badge variant={TYPE_BADGE[k.keyword_type] ?? 'secondary'}>
                      {KEYWORD_TYPES.find((t) => t.id === k.keyword_type)?.label ?? k.keyword_type}
                    </Badge>
                    {!k.is_active && <Badge variant="outline">Paused</Badge>}
                  </div>
                  {k.brand_context && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{k.brand_context}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sources:{' '}
                    {(k.sources ?? []).length > 0
                      ? (k.sources ?? [])
                          .map((s) => AVAILABLE_SOURCES.find((a) => a.id === s)?.label ?? s)
                          .join(', ')
                      : 'none'}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive(r.recordId, k.is_active)}
                    >
                      {k.is_active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setEditor({
                          recordId: r.recordId,
                          term: k.term,
                          keyword_type: k.keyword_type ?? 'brand',
                          brand_context: k.brand_context ?? '',
                          sources: k.sources ?? [],
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(r.recordId)}>
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <Modal open={editor !== null} onClose={() => setEditor(null)}>
        <Modal.Header onClose={() => setEditor(null)}>
          <Modal.Title>{editor?.recordId ? 'Edit keyword' : 'Add keyword'}</Modal.Title>
        </Modal.Header>
        {editor && (
          <Modal.Body className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Term</label>
              <Input
                data-testid="keyword-term"
                value={editor.term}
                onChange={(e) => setEditor({ ...editor, term: e.target.value })}
                placeholder="e.g. durable objects"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Type</label>
              <div className="flex flex-wrap gap-2">
                {KEYWORD_TYPES.map((t) => (
                  <Button
                    key={t.id}
                    type="button"
                    size="sm"
                    variant={editor.keyword_type === t.id ? 'default' : 'secondary'}
                    onClick={() => setEditor({ ...editor, keyword_type: t.id })}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Brand context</label>
              <textarea
                data-testid="keyword-context"
                value={editor.brand_context}
                onChange={(e) => setEditor({ ...editor, brand_context: e.target.value })}
                placeholder="What does this keyword mean for your brand? The AI scorer uses this to judge relevance."
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Sources</label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SOURCES.map((s) => {
                  const on = editor.sources.includes(s.id)
                  return (
                    <Button
                      key={s.id}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'secondary'}
                      onClick={() =>
                        setEditor({
                          ...editor,
                          sources: on
                            ? editor.sources.filter((x) => x !== s.id)
                            : [...editor.sources, s.id],
                        })
                      }
                    >
                      {s.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button data-testid="save-keyword" onClick={save} disabled={saving || !editor.term.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </Modal.Body>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete keyword?"
        description="Existing mentions stay; we just stop crawling for this term."
      />
    </div>
  )
}
