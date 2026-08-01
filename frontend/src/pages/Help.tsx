import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import {
  Search, ChevronDown, ChevronRight, Download, X, Link2, Compass,
  Package, Target, Users, Crosshair, LifeBuoy, Lightbulb,
} from 'lucide-react'
import { faqApi, type FAQ } from '../api/faq'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { SkeletonList } from '../components/Skeleton'
import { Capacitor } from '@capacitor/core'
import { androidApkUrl } from '../utils/site'
import { toast } from '../store/toast'

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

// The APK download only makes sense on the web build — inside the native app
// the user already has it installed.
const isNativeApp = Capacitor.isNativePlatform()

// The same first-session path the Dashboard checklist walks people through,
// repeated here for anyone who arrives at Help before doing anything else.
const quickStart = [
  { icon: Package, title: 'Add your rifle', body: 'Pick it from the catalog and the specs fill themselves in.', to: '/gear', cta: 'Open Gear' },
  { icon: Target, title: 'Log a score card', body: '25 shots, a rifle, a pellet — that is a card.', to: '/scores/new', cta: 'Log a card' },
  { icon: Users, title: 'Join a club or league', body: 'Shoot alongside your club; leagues rank your cards.', to: '/clubs', cta: 'Browse clubs' },
  { icon: Crosshair, title: 'Test your pellets', body: 'Photograph a group and sub12 measures it for you.', to: '/pellet-testing/new', cta: 'Start a test' },
] as const

/** Reads the article slug from the URL fragment, e.g. /help#moa-explained. */
function slugFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  return hash ? decodeURIComponent(hash) : null
}

export default function Help() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [openSlug, setOpenSlug] = useState<string | null>(slugFromHash)
  // Set when the fragment opened an article, so it can be scrolled into view
  // once the answer has actually rendered.
  const pendingScrollRef = useRef<string | null>(slugFromHash())

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
    () => groupByCategory(items).map(([cat, list]) => [cat, list.length] as [string, number]),
    [items],
  )

  const visibleGrouped = activeCategory
    ? grouped.filter(([cat]) => cat === activeCategory)
    : grouped

  // A shared link lands mid-page, so bring the article into view — but only
  // after the FAQs have loaded and the accordion has painted its answer.
  useEffect(() => {
    const slug = pendingScrollRef.current
    if (!slug || items.length === 0) return
    pendingScrollRef.current = null
    document.getElementById(`faq-${slug}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [items])

  // Keep back/forward navigation between shared article links working.
  useEffect(() => {
    const onHashChange = () => {
      const slug = slugFromHash()
      setOpenSlug(slug)
      pendingScrollRef.current = slug
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function toggleArticle(slug: string) {
    const next = openSlug === slug ? null : slug
    setOpenSlug(next)
    // replaceState rather than a hash assignment: this should not stack a
    // history entry for every accordion click.
    window.history.replaceState(null, '', next ? `#${encodeURIComponent(next)}` : window.location.pathname)
  }

  async function copyArticleLink(slug: string) {
    const url = `${window.location.origin}${window.location.pathname}#${encodeURIComponent(slug)}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Link to this answer copied', 'success')
    } catch {
      toast('Could not copy the link', 'error')
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-12 lg:pt-7 lg:pb-20">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="t-page-title">Help &amp; FAQ</h1>
        <HelpIcon content={pageHelp.help} />
      </div>
      <p className="mb-5 text-sm text-muted">
        Search the guides below, or start with the four steps that set up a new account.
      </p>

      {/* ── New here? ────────────────────────────────────────────────── */}
      <section
        aria-labelledby="quick-start-title"
        className="mb-5 rounded-lg border border-subtle bg-surface overflow-hidden"
      >
        <header className="flex items-center gap-1.5 px-4 py-3 border-b border-subtle bg-[var(--brass)]/[0.06]">
          <Compass size={14} className="text-[var(--brass)]" />
          <h2 id="quick-start-title" className="t-section-title">New to sub12? Start here</h2>
        </header>
        <ol className="grid gap-2 p-3 sm:grid-cols-2">
          {quickStart.map(({ icon: Icon, title, body, to, cta }, i) => (
            <li key={to}>
              <Link
                to={to}
                className="flex h-full items-start gap-3 rounded-lg border border-subtle p-3 hover:border-[var(--brass)]/50 hover:bg-surface-hover u-nudge transition-colors"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-[var(--brass)]/10 text-[var(--brass)]"
                >
                  <Icon size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-primary">
                    <span className="text-muted u-tnum">{i + 1}. </span>
                    {title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{body}</span>
                  <span className="mt-1 block text-[11px] font-medium text-[var(--brass)]">{cta} →</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <div className="mb-5 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          aria-label="Search help articles"
          placeholder="Search help articles..."
          className="w-full bg-surface border border-subtle rounded pl-9 pr-9 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-primary u-press transition-colors no-min-target"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Categories: a horizontal chip rail on mobile, a sidebar on desktop. */}
        <aside className="h-fit lg:rounded-lg lg:border lg:border-subtle lg:bg-surface lg:p-3">
          <h2 className="t-section-title pb-2 lg:px-2">Categories</h2>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-col lg:space-y-1 lg:gap-0 lg:overflow-x-visible lg:px-0 lg:pb-0">
            <button
              onClick={() => setActiveCategory(null)}
              aria-pressed={activeCategory === null}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors lg:w-full lg:rounded lg:border-transparent lg:px-2.5 lg:py-2 lg:text-left ${activeCategory === null ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/10' : 'border-subtle text-secondary hover:bg-surface-hover'}`}
            >
              All
              <span className="ml-1.5 text-xs text-muted u-tnum">{items.length}</span>
            </button>
            {categories.map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                aria-pressed={activeCategory === cat}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors lg:flex lg:w-full lg:items-center lg:justify-between lg:gap-2 lg:rounded lg:border-transparent lg:px-2.5 lg:py-2 lg:text-left ${activeCategory === cat ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/10' : 'border-subtle text-secondary hover:bg-surface-hover'}`}
              >
                {cat}
                <span className="ml-1.5 text-xs text-muted u-tnum lg:ml-0">{count}</span>
              </button>
            ))}
          </div>

          {/* Hidden inside the native app, where the APK is already installed. */}
          {!isNativeApp && (
            <>
              <hr className="u-hairline my-3 hidden lg:block" />
              <div className="hidden lg:block">
                <h2 className="t-section-title px-2 pb-2">Android App</h2>
                <a
                  href={androidApkUrl()}
                  className="flex items-center gap-2 rounded px-2.5 py-2 text-sm text-secondary hover:bg-surface-hover hover:text-[var(--brass)] u-nudge"
                >
                  <Download size={15} className="shrink-0 text-muted" />
                  Download the APK
                </a>
                <p className="px-2.5 pt-1 text-[11px] leading-4 text-muted">
                  Direct install — Android will ask you to allow it the first time.
                </p>
              </div>
            </>
          )}
        </aside>

        <section className="space-y-5">
          {faqsQuery.isLoading && <SkeletonList count={4} />}

          {faqsQuery.isError && (
            <div className="rounded-lg border border-subtle bg-surface p-6 text-center">
              <p className="text-sm text-primary">Help articles could not be loaded.</p>
              <button onClick={() => faqsQuery.refetch()} className="btn btn-secondary btn-sm mt-3">
                Try again
              </button>
            </div>
          )}

          {!faqsQuery.isLoading && !faqsQuery.isError && visibleGrouped.length === 0 && (
            <div className="rounded-lg border border-subtle bg-surface p-6 text-center">
              <p className="text-sm text-primary">
                {query ? <>Nothing matched “{query}”.</> : 'No help articles here yet.'}
              </p>
              <p className="mt-1 text-xs text-muted">
                Ask us directly and we will answer — and usually add an article for the next person.
              </p>
              <Link to="/support" className="btn btn-primary btn-sm mt-3 inline-flex">
                Send us the question
              </Link>
            </div>
          )}

          {visibleGrouped.map(([category, list]) => (
            <div key={category} className="bg-surface border border-subtle rounded-lg">
              <h2 className="t-section-title px-4 pt-4 pb-2">
                {category}
              </h2>
              <div className="divide-y divide-subtle">
                {list.map((faq) => {
                  const open = openSlug === faq.slug
                  return (
                    <div key={faq.id} id={`faq-${faq.slug}`} className="scroll-mt-20">
                      <h3>
                        <button
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
                          onClick={() => toggleArticle(faq.slug)}
                          aria-expanded={open}
                          aria-controls={`faq-answer-${faq.slug}`}
                        >
                          <span className="text-sm text-primary">{faq.question}</span>
                          {open ? (
                            <ChevronDown size={16} className="text-muted flex-shrink-0" />
                          ) : (
                            <ChevronRight size={16} className="text-muted flex-shrink-0" />
                          )}
                        </button>
                      </h3>
                      {open && (
                        <div id={`faq-answer-${faq.slug}`} role="region" className="px-4 pb-4">
                          <div className="prose prose-sm dark:prose-invert max-w-none text-secondary">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{faq.answer_md}</ReactMarkdown>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-subtle pt-3">
                            <button
                              onClick={() => copyArticleLink(faq.slug)}
                              className="inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-[var(--brass)] transition-colors"
                            >
                              <Link2 size={13} />
                              Copy link to this answer
                            </button>
                            <Link
                              to="/support"
                              className="inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-[var(--brass)] transition-colors"
                            >
                              <LifeBuoy size={13} />
                              This did not answer it
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* ── Escalation ────────────────────────────────────────────── */}
          <div className="rounded-lg border border-subtle bg-surface p-4">
            <h2 className="t-section-title">Still stuck?</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              There is no such thing as a daft question here — plenty of people are logging their
              first card this week too.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/support" className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
                <LifeBuoy size={13} />
                Ask support
              </Link>
              <Link to="/feature-requests" className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
                <Lightbulb size={13} />
                Suggest a feature
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
