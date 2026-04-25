import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import { faqApi, type FAQ } from '../api/faq'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

function groupByCategory(items: FAQ[]): [string, FAQ[]][] {
  const map = new Map<string, { order: number; list: FAQ[] }>()
  for (const item of items) {
    const bucket = map.get(item.category) ?? { order: item.category_order, list: [] }
    bucket.list.push(item)
    map.set(item.category, bucket)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
    .map(([category, bucket]) => [category, bucket.list] as [string, FAQ[]])
}

export default function Help() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [openSlug, setOpenSlug] = useState<string | null>(null)

  const faqsQuery = useQuery({
    queryKey: ['faqs'],
    queryFn: faqApi.list,
  })

  const items = useMemo<FAQ[]>(() => faqsQuery.data?.items ?? [], [faqsQuery.data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (f) =>
        f.question.toLowerCase().includes(q) ||
        f.answer_md.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q),
    )
  }, [items, query])

  const grouped = useMemo(() => groupByCategory(filtered), [filtered])
  const categories = useMemo(
    () => groupByCategory(items).map(([cat]) => cat),
    [items],
  )

  const visibleGrouped = activeCategory
    ? grouped.filter(([cat]) => cat === activeCategory)
    : grouped

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-5 flex items-center gap-2">
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Help &amp; FAQ</h1>
        <HelpIcon content={pageHelp.help} />
      </div>

      <div className="mb-5 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles..."
          className="w-full bg-surface border border-subtle rounded pl-9 pr-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="bg-surface border border-subtle rounded-lg p-3 h-fit">
          <h2 className="text-xs uppercase tracking-widest text-muted px-2 pb-2">Categories</h2>
          <div className="space-y-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={`w-full text-left rounded px-2.5 py-2 text-sm transition-colors ${activeCategory === null ? 'text-[var(--brass)] bg-[var(--brass)]/10' : 'text-secondary hover:bg-surface-hover'}`}
            >
              All categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`w-full text-left rounded px-2.5 py-2 text-sm transition-colors ${activeCategory === cat ? 'text-[var(--brass)] bg-[var(--brass)]/10' : 'text-secondary hover:bg-surface-hover'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-5">
          {faqsQuery.isLoading && <p className="text-sm text-muted">Loading…</p>}
          {!faqsQuery.isLoading && visibleGrouped.length === 0 && (
            <p className="text-sm text-muted">No help articles match your search.</p>
          )}

          {visibleGrouped.map(([category, list]) => (
            <div key={category} className="bg-surface border border-subtle rounded-lg">
              <h2 className="text-sm tracking-widest uppercase text-muted px-4 pt-4 pb-2">
                {category}
              </h2>
              <div className="divide-y divide-subtle">
                {list.map((faq) => {
                  const open = openSlug === faq.slug
                  return (
                    <div key={faq.id}>
                      <button
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
                        onClick={() => setOpenSlug(open ? null : faq.slug)}
                      >
                        <span className="text-sm text-primary">{faq.question}</span>
                        {open ? (
                          <ChevronDown size={16} className="text-muted flex-shrink-0" />
                        ) : (
                          <ChevronRight size={16} className="text-muted flex-shrink-0" />
                        )}
                      </button>
                      {open && (
                        <div className="px-4 pb-4 prose prose-sm dark:prose-invert max-w-none text-secondary">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{faq.answer_md}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
