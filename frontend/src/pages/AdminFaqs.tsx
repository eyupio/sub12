import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Trash2 } from 'lucide-react'
import { adminFaqApi, type FAQ, type CreateFAQInput } from '../api/adminFaq'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const textareaCls = `${inputCls} min-h-[260px] font-mono`
const labelCls = 'text-[11px] tracking-widest uppercase text-muted'
const btnPrimary =
  'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'
const btnSecondary =
  'border border-subtle hover:border-strong text-secondary hover:text-primary text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors'
const btnDanger =
  'border border-red-500/50 hover:bg-red-500/10 text-red-400 text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors'

type FormState = {
  slug: string
  category: string
  question: string
  answer_md: string
  sort_order: number
  is_published: boolean
}

const emptyForm: FormState = {
  slug: '',
  category: '',
  question: '',
  answer_md: '',
  sort_order: 0,
  is_published: true,
}

function parseError(error: unknown) {
  if (!(error instanceof Error)) return 'Request failed.'
  return error.message
}

export default function AdminFaqs() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(emptyForm))
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const listQuery = useQuery({
    queryKey: ['admin-faqs'],
    queryFn: adminFaqApi.list,
  })

  const items = useMemo<FAQ[]>(() => listQuery.data?.items ?? [], [listQuery.data])

  const itemsByCategory = useMemo(() => {
    const groups = new Map<string, FAQ[]>()
    for (const item of items) {
      const bucket = groups.get(item.category) ?? []
      bucket.push(item)
      groups.set(item.category, bucket)
    }
    return Array.from(groups.entries())
  }, [items])

  useEffect(() => {
    if (!selectedId && !creating && items.length > 0) {
      loadItem(items[0])
    }
  }, [items, selectedId, creating])

  function loadItem(item: FAQ) {
    setCreating(false)
    setSelectedId(item.id)
    const next: FormState = {
      slug: item.slug,
      category: item.category,
      question: item.question,
      answer_md: item.answer_md,
      sort_order: item.sort_order,
      is_published: item.is_published,
    }
    setForm(next)
    setSavedSnapshot(JSON.stringify(next))
    setServerError(null)
    setSuccessMessage(null)
  }

  function startCreate() {
    setCreating(true)
    setSelectedId(null)
    setForm(emptyForm)
    setSavedSnapshot(JSON.stringify(emptyForm))
    setServerError(null)
    setSuccessMessage(null)
  }

  const isDirty = useMemo(() => JSON.stringify(form) !== savedSnapshot, [form, savedSnapshot])

  const createMutation = useMutation({
    mutationFn: (payload: CreateFAQInput) => adminFaqApi.create(payload),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] })
      queryClient.invalidateQueries({ queryKey: ['faqs'] })
      setCreating(false)
      setSelectedId(item.id)
      const next: FormState = {
        slug: item.slug,
        category: item.category,
        question: item.question,
        answer_md: item.answer_md,
        sort_order: item.sort_order,
        is_published: item.is_published,
      }
      setForm(next)
      setSavedSnapshot(JSON.stringify(next))
      setSuccessMessage('FAQ created.')
      setTimeout(() => setSuccessMessage(null), 2500)
    },
    onError: (err) => setServerError(parseError(err)),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('no selection')
      return adminFaqApi.update(selectedId, form)
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] })
      queryClient.invalidateQueries({ queryKey: ['faqs'] })
      const next: FormState = {
        slug: item.slug,
        category: item.category,
        question: item.question,
        answer_md: item.answer_md,
        sort_order: item.sort_order,
        is_published: item.is_published,
      }
      setForm(next)
      setSavedSnapshot(JSON.stringify(next))
      setSuccessMessage('FAQ updated.')
      setTimeout(() => setSuccessMessage(null), 2500)
    },
    onError: (err) => setServerError(parseError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('no selection')
      return adminFaqApi.remove(selectedId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] })
      queryClient.invalidateQueries({ queryKey: ['faqs'] })
      setSelectedId(null)
      setForm(emptyForm)
      setSavedSnapshot(JSON.stringify(emptyForm))
      setSuccessMessage('FAQ deleted.')
      setTimeout(() => setSuccessMessage(null), 2500)
    },
    onError: (err) => setServerError(parseError(err)),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    if (creating) {
      createMutation.mutate(form)
    } else {
      updateMutation.mutate()
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-primary">Admin • FAQs</h1>
        <HelpIcon content={pageHelp.adminFaqs} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="bg-surface border border-subtle rounded-lg p-3 space-y-2 h-fit">
          <button className={`${btnSecondary} w-full flex items-center justify-center gap-2`} onClick={startCreate}>
            <Plus size={14} /> New FAQ
          </button>

          {itemsByCategory.map(([category, list]) => (
            <div key={category} className="space-y-1">
              <h2 className="text-xs uppercase tracking-widest text-muted px-2 pt-2">{category}</h2>
              {list.map((item) => (
                <button
                  key={item.id}
                  className={`w-full text-left rounded px-2.5 py-2 text-sm border transition-colors ${
                    selectedId === item.id
                      ? 'border-[var(--brass)]/50 text-[var(--brass)] bg-[var(--brass)]/10'
                      : 'border-transparent text-secondary hover:bg-surface-hover'
                  }`}
                  onClick={() => loadItem(item)}
                >
                  <div className="font-medium truncate">{item.question}</div>
                  <div className="text-[11px] text-muted truncate">
                    {item.slug} · {item.is_published ? 'Published' : 'Draft'}
                  </div>
                </button>
              ))}
            </div>
          ))}

          {!items.length && <p className="text-xs text-muted px-2 py-3">No FAQs yet. Create one above.</p>}
        </aside>

        <section className="bg-surface border border-subtle rounded-lg p-4 space-y-4">
          {listQuery.isLoading && <p className="text-sm text-muted">Loading...</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {serverError && <p className="text-sm text-[var(--error-text)]">{serverError}</p>}
            {successMessage && <p className="text-sm text-green-400">{successMessage}</p>}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>Slug</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="lowercase-kebab-case"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Category</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder="e.g. Getting Started"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelCls}>Question</label>
              <input
                value={form.question}
                onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>Answer (markdown)</label>
                <textarea
                  value={form.answer_md}
                  onChange={(e) => setForm((p) => ({ ...p, answer_md: e.target.value }))}
                  className={textareaCls}
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Preview</label>
                <div className="min-h-[260px] border border-subtle rounded p-3 bg-surface-hover prose prose-sm dark:prose-invert max-w-none text-secondary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.answer_md || '*Nothing to preview yet.*'}</ReactMarkdown>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[160px_1fr]">
              <div className="space-y-1">
                <label className={labelCls}>Sort order</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) || 0 }))}
                  className={inputCls}
                />
              </div>
              <label className="text-sm text-secondary inline-flex items-center gap-2 self-end pb-2">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm((p) => ({ ...p, is_published: e.target.checked }))}
                />
                Published
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className={btnPrimary}
              >
                {creating
                  ? createMutation.isPending
                    ? 'Creating...'
                    : 'Create FAQ'
                  : updateMutation.isPending
                    ? 'Saving...'
                    : 'Save FAQ'}
              </button>
              {!creating && selectedId && (
                <button type="button" className={btnDanger} onClick={() => setDeleteOpen(true)}>
                  <span className="inline-flex items-center gap-2">
                    <Trash2 size={14} /> Delete
                  </span>
                </button>
              )}
              {isDirty && <span className="text-xs text-amber-400 self-center">You have unsaved changes.</span>}
            </div>
          </form>
        </section>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this FAQ?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          deleteMutation.mutate()
          setDeleteOpen(false)
        }}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}
