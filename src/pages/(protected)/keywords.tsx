/**
 * Keywords — monitor management. Create/edit/delete the terms the app
 * crawls for, with per-keyword brand context that tunes AI scoring.
 */

import { useMemo, useState } from 'react'
import { useQuery, useMutations, useUser } from 'deepspace'
import { Plus, MoreVertical } from 'lucide-react'
import {
  Button,
  Input,
  Modal,
  ConfirmModal,
  EmptyState,
  SkeletonList,
  DropdownMenu,
  useToast,
  cn,
} from '@/components/ui'
import { PageHeader } from '../../components/PageHeader'
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

/** Type-badge palette — exact tints from the design system. */
const TYPE_BADGE: Record<KeywordType, string> = {
  brand: 'bg-primary/[0.08] text-primary',
  feature: 'bg-[#e7f2ff] text-[#2563eb]',
  competitor: 'bg-[#fdeaea] text-[#d64b4b]',
  pain_point: 'bg-[#fdf3e7] text-[#b4761f]',
}

/** 32×18 accent switch — drives the same is_active mutation as before. */
function Toggle({
  on,
  onClick,
  disabled,
  label,
}: {
  on: boolean
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors disabled:cursor-default disabled:opacity-60',
        on ? 'bg-primary' : 'bg-[#d5d9df]',
      )}
    >
      <span
        className={cn(
          'h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform',
          on && 'translate-x-[14px]',
        )}
      />
    </button>
  )
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

const GRID = 'grid-cols-[1.6fr_110px_1fr_90px_70px_40px]'

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
  const activeCount = useMemo(() => sorted.filter((r) => r.data.is_active).length, [sorted])
  const loading = status === 'loading'

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
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Keywords"
        meta={
          <span>
            {sorted.length} tracked · {activeCount} active
          </span>
        }
        actions={
          canEdit && (
            <Button
              data-testid="add-keyword"
              size="sm"
              onClick={() => setEditor({ ...EMPTY_EDITOR })}
              className="h-8 gap-1.5 px-3 text-[12.5px] [&_svg]:size-3.5"
            >
              <Plus aria-hidden />
              Add keyword
            </Button>
          )
        }
      />

      <div className="flex-1 px-4 py-5 sm:px-5">
        {loading && <SkeletonList rows={5} />}

        {!loading && sorted.length === 0 && (
          <div className="rounded-xl border border-border shadow-card">
            <EmptyState
              title="No keywords yet"
              description="Add your brand, features, competitors, or pain points to start monitoring."
              {...(canEdit
                ? { action: { label: 'Add keyword', onClick: () => setEditor({ ...EMPTY_EDITOR }) } }
                : {})}
            />
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div className="overflow-x-auto">
              <div className="min-w-[680px]" data-testid="keyword-list">
                {/* Column header */}
                <div
                  className={cn(
                    'grid items-center gap-3.5 border-b border-border px-[18px] py-2.5 text-[10px] font-bold uppercase tracking-[0.07em] text-tertiary',
                    GRID,
                  )}
                >
                  <span>Keyword</span>
                  <span>Type</span>
                  <span>Sources</span>
                  <span className="text-right">Mentions</span>
                  <span className="text-center">Active</span>
                  <span />
                </div>

                {sorted.map((r) => {
                  const k = r.data
                  const active = !!k.is_active
                  return (
                    <div
                      key={r.recordId}
                      data-testid="keyword-row"
                      className={cn(
                        'group grid items-center gap-3.5 border-b border-border px-[18px] py-[13px] transition-colors last:border-b-0 hover:bg-[#fafbfc]',
                        GRID,
                        !active && 'opacity-60',
                      )}
                    >
                      {/* Keyword */}
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold text-foreground">{k.term}</div>
                        {k.brand_context && (
                          <div className="truncate text-[11.5px] text-tertiary">{k.brand_context}</div>
                        )}
                      </div>

                      {/* Type */}
                      <div>
                        <span
                          className={cn(
                            'inline-flex h-5 items-center rounded-md px-2 text-[10.5px] font-semibold',
                            TYPE_BADGE[k.keyword_type] ?? TYPE_BADGE.pain_point,
                          )}
                        >
                          {KEYWORD_TYPES.find((t) => t.id === k.keyword_type)?.label ?? k.keyword_type}
                        </span>
                      </div>

                      {/* Sources */}
                      <div className="flex flex-wrap gap-1.5">
                        {(k.sources ?? []).length > 0 ? (
                          (k.sources ?? []).map((s) => (
                            <span
                              key={s}
                              className="rounded-[5px] border border-input px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              {AVAILABLE_SOURCES.find((a) => a.id === s)?.label ?? s}
                            </span>
                          ))
                        ) : (
                          <span className="font-mono text-[10px] text-tertiary">no sources</span>
                        )}
                      </div>

                      {/* Mentions — count not tracked on the keyword record */}
                      <div className="text-right text-[13px] font-semibold tabular-nums text-tertiary">—</div>

                      {/* Active toggle */}
                      <div className="flex justify-center">
                        <Toggle
                          on={active}
                          disabled={!canEdit}
                          label={active ? 'Pause keyword' : 'Resume keyword'}
                          onClick={() => toggleActive(r.recordId, k.is_active)}
                        />
                      </div>

                      {/* Overflow menu */}
                      <div className="flex justify-center">
                        {canEdit && (
                          <DropdownMenu>
                            <DropdownMenu.Trigger
                              chevron={false}
                              aria-label="Keyword actions"
                              className="h-[26px] w-[26px] justify-center border-transparent px-0 text-tertiary hover:bg-secondary hover:text-foreground [&_svg]:size-[15px]"
                            >
                              <MoreVertical aria-hidden />
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align="end">
                              <DropdownMenu.Item
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
                              </DropdownMenu.Item>
                              <DropdownMenu.Item onClick={() => toggleActive(r.recordId, k.is_active)}>
                                {active ? 'Pause' : 'Resume'}
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleting(r.recordId)}
                              >
                                Delete
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal open={editor !== null} onClose={() => setEditor(null)}>
        <Modal.Header onClose={() => setEditor(null)}>
          <Modal.Title>{editor?.recordId ? 'Edit keyword' : 'Add keyword'}</Modal.Title>
        </Modal.Header>
        {editor && (
          <Modal.Body className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground">Term</label>
              <Input
                data-testid="keyword-term"
                className="h-9 text-[13px]"
                value={editor.term}
                onChange={(e) => setEditor({ ...editor, term: e.target.value })}
                placeholder="e.g. durable objects"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {KEYWORD_TYPES.map((t) => (
                  <Button
                    key={t.id}
                    type="button"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    variant={editor.keyword_type === t.id ? 'default' : 'secondary'}
                    onClick={() => setEditor({ ...editor, keyword_type: t.id })}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground">
                Brand context
              </label>
              <textarea
                data-testid="keyword-context"
                value={editor.brand_context}
                onChange={(e) => setEditor({ ...editor, brand_context: e.target.value })}
                placeholder="What does this keyword mean for your brand? The AI scorer uses this to judge relevance."
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground">Sources</label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_SOURCES.map((s) => {
                  const on = editor.sources.includes(s.id)
                  return (
                    <Button
                      key={s.id}
                      type="button"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
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
              <Button variant="secondary" size="sm" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button
                data-testid="save-keyword"
                size="sm"
                onClick={save}
                disabled={saving || !editor.term.trim()}
              >
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
        confirmText="Delete"
      />
    </div>
  )
}
