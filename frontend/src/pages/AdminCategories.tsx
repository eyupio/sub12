import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus, Save } from 'lucide-react'
import { categoriesApi, type Category } from '../api/categories'
import { toast } from '../store/toast'

export default function AdminCategories() {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ['admin-categories'], queryFn: () => categoriesApi.adminList() })

  const create = useMutation({
    mutationFn: (body: { slug: string; label: string; sort_order: number }) =>
      categoriesApi.adminCreate(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories', 'public'] })
      toast('Category added', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to add', 'error'),
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Category> }) =>
      categoriesApi.adminUpdate(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories', 'public'] })
      toast('Saved', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to save', 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => categoriesApi.adminDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories', 'public'] })
      toast('Category removed', 'info')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to remove', 'error'),
  })

  const items = list.data?.items ?? []

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-1">Categories</h1>
      <p className="text-sm text-muted mb-5">
        Platform-wide participant categories. Used by Live Events and any future feature that
        groups participants (Open, Lady, Veteran, etc.).
      </p>

      <CreateForm onSubmit={(slug, label, sortOrder) => create.mutate({ slug, label, sort_order: sortOrder })} pending={create.isPending} />

      <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-subtle bg-card">
        {items.map((c) => (
          <Row
            key={c.id}
            cat={c}
            onSave={(body) => update.mutate({ id: c.id, body })}
            onRemove={() => remove.mutate(c.id)}
            pending={update.isPending || remove.isPending}
          />
        ))}
        {items.length === 0 && <li className="p-3 text-sm text-muted">No categories yet.</li>}
      </ul>
    </div>
  )
}

function CreateForm({
  onSubmit,
  pending,
}: {
  onSubmit: (slug: string, label: string, sortOrder: number) => void
  pending: boolean
}) {
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [sortOrder, setSortOrder] = useState(100)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!slug.trim() || !label.trim()) return
    onSubmit(slug.trim().toLowerCase(), label.trim(), sortOrder)
    setSlug('')
    setLabel('')
    setSortOrder(100)
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-4">
        <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">Slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="open"
          className="w-full rounded-md border border-subtle bg-card px-2 py-1.5 text-sm font-mono"
        />
      </div>
      <div className="col-span-5">
        <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Open"
          className="w-full rounded-md border border-subtle bg-card px-2 py-1.5 text-sm"
        />
      </div>
      <div className="col-span-2">
        <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">Order</label>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number.parseInt(e.target.value || '0', 10))}
          className="w-full rounded-md border border-subtle bg-card px-2 py-1.5 text-sm"
        />
      </div>
      <div className="col-span-1">
        <button
          type="submit"
          disabled={pending}
          aria-label="Add category"
          className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white p-2 disabled:opacity-50"
        >
          <Plus size={16} className="mx-auto" />
        </button>
      </div>
    </form>
  )
}

function Row({
  cat,
  onSave,
  onRemove,
  pending,
}: {
  cat: Category
  onSave: (body: Partial<Category>) => void
  onRemove: () => void
  pending: boolean
}) {
  const [label, setLabel] = useState(cat.label)
  const [sortOrder, setSortOrder] = useState(cat.sort_order)
  const [active, setActive] = useState(cat.is_active)
  const dirty = label !== cat.label || sortOrder !== cat.sort_order || active !== cat.is_active

  return (
    <li className="grid grid-cols-12 gap-2 p-3 items-center">
      <span className="col-span-3 font-mono text-xs text-muted">{cat.slug}</span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="col-span-4 rounded-md border border-subtle bg-surface px-2 py-1 text-sm"
      />
      <input
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(Number.parseInt(e.target.value || '0', 10))}
        className="col-span-2 rounded-md border border-subtle bg-surface px-2 py-1 text-sm"
      />
      <label className="col-span-1 text-xs flex items-center gap-1">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        On
      </label>
      <div className="col-span-2 flex justify-end gap-1">
        <button
          type="button"
          onClick={() => onSave({ label, sort_order: sortOrder, is_active: active })}
          disabled={!dirty || pending}
          aria-label="Save"
          className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-30"
        >
          <Save size={14} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          aria-label="Remove"
          className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}
