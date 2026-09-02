import { useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  CalendarClock,
  CheckCircle,
  ChevronDown,
  Crosshair,
  Grid2X2,
  Images,
  Package,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import { galleryApi, GalleryItem } from '../api/gallery'
import { scoreCardApi } from '../api/scoreCards'
import { ApiError } from '../api/client'
import { toast } from '../store/toast'
import { SubmitToLeagueDialog } from '../components/SubmitToLeagueDialog'
import { SubmitToEventDialog } from '../components/SubmitToEventDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatDateShort, useRegionalPrefs } from '../utils/date'

type KindFilter = 'all' | 'score_card' | 'gear' | 'pellet_test'
type WhereFilter = 'any' | 'league' | 'club' | 'event' | 'unsubmitted'
type SortMode = 'newest' | 'score'

function isGear(item: GalleryItem) {
  return item.kind === 'rifle' || item.kind === 'pellet'
}

function isSubmitted(item: GalleryItem) {
  return Boolean(item.league_round_id || item.club_id || item.event_participant_id)
}

function matchesKind(item: GalleryItem, kind: KindFilter) {
  if (kind === 'all') return true
  if (kind === 'gear') return isGear(item)
  return item.kind === kind
}

function matchesWhere(item: GalleryItem, where: WhereFilter) {
  switch (where) {
    case 'any':
      return true
    case 'league':
      return Boolean(item.league_round_id)
    case 'club':
      return Boolean(item.club_id)
    case 'event':
      return Boolean(item.event_participant_id)
    case 'unsubmitted':
      return item.kind === 'score_card' && !isSubmitted(item)
  }
}

function kindIcon(kind: GalleryItem['kind']) {
  switch (kind) {
    case 'score_card':
      return Target
    case 'pellet_test':
      return Crosshair
    case 'rifle':
    case 'pellet':
      return Package
  }
}

function kindLabel(kind: GalleryItem['kind']) {
  switch (kind) {
    case 'score_card':
      return 'Score card'
    case 'rifle':
      return 'Rifle'
    case 'pellet':
      return 'Pellets'
    case 'pellet_test':
      return 'Pellet test'
  }
}

function StatusPill({ item }: { item: GalleryItem }) {
  if (item.kind !== 'score_card') return null
  if (item.is_draft) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
        Draft
      </span>
    )
  }
  if (!isSubmitted(item)) return null
  const status = item.verification
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
        <CheckCircle size={10} /> Verified
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-300">
        Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-300">
      Pending
    </span>
  )
}

// One badge per place the item has been submitted to. These are what make the
// gallery a submissions overview rather than a plain photo wall.
function SubmissionBadges({ item, compact = false }: { item: GalleryItem; compact?: boolean }) {
  const badges: { icon: typeof Trophy; label: string }[] = []
  if (item.league_name || item.league_round_id) {
    const league = item.league_name ?? 'League'
    badges.push({ icon: Trophy, label: item.round_name && !compact ? `${league} · ${item.round_name}` : league })
  }
  if (item.club_id) {
    badges.push({ icon: Users, label: item.club_name ?? 'Club' })
  }
  if (item.event_participant_id) {
    badges.push({ icon: CalendarClock, label: item.event_name ?? 'Event' })
  }
  if (badges.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map(({ icon: Icon, label }) => (
        <span
          key={label}
          className={
            compact
              ? 'inline-flex max-w-full items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white'
              : 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-subtle bg-surface-hover px-2.5 py-1 text-xs text-secondary'
          }
        >
          <Icon size={compact ? 10 : 12} className="shrink-0 text-brass" />
          <span className="truncate">{label}</span>
        </span>
      ))}
    </div>
  )
}

function GalleryImage({
  item,
  className,
  sizes,
}: {
  item: GalleryItem
  className: string
  sizes?: string
}) {
  const rotation = ((item.image_rotation ?? 0) % 360 + 360) % 360
  return (
    <img
      src={item.image_url}
      alt={item.title}
      loading="lazy"
      sizes={sizes}
      className={className}
      style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
    />
  )
}

// Where "open" leads for each kind of item.
function itemLink(item: GalleryItem): { to: string; params?: Record<string, string>; search?: Record<string, string>; label: string } {
  switch (item.kind) {
    case 'score_card':
      return item.is_draft
        ? { to: '/scores/new', search: { draftId: item.id }, label: 'Refine draft' }
        : { to: '/scores/$id', params: { id: item.id }, label: 'Open card' }
    case 'rifle':
      return { to: '/gear/rifles/$id', params: { id: item.id }, label: 'Open showcase' }
    case 'pellet':
      return { to: '/gear/pellets/$id', params: { id: item.id }, label: 'Open showcase' }
    case 'pellet_test':
      return { to: '/pellet-testing/$id', params: { id: item.session_id ?? item.id }, label: 'Open test' }
  }
}

export default function Gallery() {
  const prefs = useRegionalPrefs()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<KindFilter>('all')
  const [where, setWhere] = useState<WhereFilter>('any')
  const [sort, setSort] = useState<SortMode>('newest')
  const [active, setActive] = useState<GalleryItem | null>(null)
  const [leagueDialogFor, setLeagueDialogFor] = useState<string | null>(null)
  const [eventDialogFor, setEventDialogFor] = useState<string | null>(null)
  const [withdrawFor, setWithdrawFor] = useState<GalleryItem | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['gallery'],
    queryFn: () => galleryApi.list(),
  })
  const items = useMemo(() => data?.items ?? [], [data])

  const counts = useMemo(
    () => ({
      all: items.length,
      score_card: items.filter((i) => i.kind === 'score_card').length,
      gear: items.filter(isGear).length,
      pellet_test: items.filter((i) => i.kind === 'pellet_test').length,
    }),
    [items]
  )

  const filtered = useMemo(() => {
    const list = items.filter((i) => matchesKind(i, kind) && matchesWhere(i, where))
    if (sort === 'score') {
      return [...list].sort((a, b) => (b.total_score ?? -1) - (a.total_score ?? -1))
    }
    return list
  }, [items, kind, where, sort])

  // The showcase: the shooter's three best photographed cards. Drafts don't
  // count — a top shot is a finished card.
  const topShots = useMemo(
    () =>
      items
        .filter((i) => i.kind === 'score_card' && !i.is_draft && (i.total_score ?? 0) > 0)
        .sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
        .slice(0, 3),
    [items]
  )

  const refreshGallery = () => {
    queryClient.invalidateQueries({ queryKey: ['gallery'] })
    queryClient.invalidateQueries({ queryKey: ['score-cards'] })
    setActive(null)
  }

  // Withdrawing echoes the whole card back with event_participant_id: '' —
  // PATCH replaces every field it's sent, so a partial body would wipe the rest.
  const withdrawMutation = useMutation({
    mutationFn: async (cardId: string) => {
      const card = await scoreCardApi.get(cardId)
      return scoreCardApi.update(cardId, {
        shot_at: card.shot_at,
        shot_scores: card.shot_scores,
        shot_xs: card.shot_xs,
        rifle_id: card.rifle_id,
        pellet_id: card.pellet_id,
        location: card.location,
        location_lat: card.location_lat,
        location_lng: card.location_lng,
        location_id: card.location_id,
        wind_mph: card.wind_mph,
        temp_celsius: card.temp_celsius,
        distance_m: card.distance_m,
        discipline: card.discipline,
        notes: card.notes,
        visibility: card.visibility,
        card_image_rotation: card.card_image_rotation,
        event_participant_id: '',
      })
    },
    onSuccess: () => {
      toast('Card withdrawn from event', 'success')
      setWithdrawFor(null)
      refreshGallery()
    },
    onError: (err) => {
      setWithdrawFor(null)
      toast(err instanceof ApiError ? err.message : 'Failed to withdraw from event', 'error')
    },
  })

  const empty = !isLoading && !isError && items.length === 0

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-12 lg:pt-7 lg:pb-20 space-y-5 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-page-title flex items-center gap-2">
            <Images size={22} className="text-brass" /> Gallery
          </h1>
          <p className="text-sm text-muted mt-1">
            Every photo you've uploaded — cards, gear and pellet tests — and where each one has been submitted.
          </p>
        </div>
        <Link to="/quick-capture" className="btn btn-primary u-sheen">
          <Camera size={15} /> Capture
        </Link>
      </div>

      {/* Top shots showcase */}
      {topShots.length > 0 && (
        <section aria-label="Top shots" className="space-y-2">
          <h2 className="t-section-title flex items-center gap-1.5">
            <Sparkles size={14} className="text-brass" /> Top shots
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {topShots.map((item, index) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() => setActive(item)}
                className={[
                  'group relative overflow-hidden rounded-lg border text-left u-lift',
                  index === 0 ? 'border-[var(--brass)] shadow-gold' : 'border-subtle shadow-card',
                ].join(' ')}
              >
                <div className="aspect-[4/3] overflow-hidden bg-surface-hover">
                  <GalleryImage
                    item={item}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 pt-6">
                  <div className="flex items-end justify-between gap-2">
                    <span className="text-lg font-semibold leading-none text-white u-tnum">
                      {item.total_score}
                      <span className="ml-1 text-[10px] font-normal text-white/70">{item.x_count}X</span>
                    </span>
                    <span className="rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      #{index + 1}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      {!empty && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by kind">
            {(
              [
                { value: 'all', label: 'All', icon: Grid2X2 },
                { value: 'score_card', label: 'Score cards', icon: Target },
                { value: 'gear', label: 'Gear', icon: Package },
                { value: 'pellet_test', label: 'Pellet tests', icon: Crosshair },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors u-press',
                  kind === value
                    ? 'border-brass bg-[var(--gold-tint)] text-brass'
                    : 'border-subtle bg-surface text-muted hover:text-secondary',
                ].join(' ')}
              >
                <Icon size={12} />
                {label}
                <span className="text-[10px] opacity-70 u-tnum">{counts[value]}</span>
              </button>
            ))}
          </div>
          <label className="ml-auto inline-flex items-center gap-1 rounded-full border border-subtle bg-surface px-3 py-1.5 text-xs text-muted">
            <select
              value={where}
              onChange={(e) => setWhere(e.target.value as WhereFilter)}
              aria-label="Filter by submission"
              className="bg-transparent outline-none"
            >
              <option value="any">Submitted anywhere</option>
              <option value="league">In a league</option>
              <option value="club">In a club</option>
              <option value="event">At an event</option>
              <option value="unsubmitted">Not submitted yet</option>
            </select>
            <ChevronDown size={12} />
          </label>
          <label className="inline-flex items-center gap-1 rounded-full border border-subtle bg-surface px-3 py-1.5 text-xs text-muted">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              aria-label="Sort"
              className="bg-transparent outline-none"
            >
              <option value="newest">Newest</option>
              <option value="score">Highest score</option>
            </select>
            <ChevronDown size={12} />
          </label>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square rounded-lg" />
          ))}
        </div>
      )}

      {isError && <p className="text-sm text-red-500">Failed to load your gallery.</p>}

      {/* Empty state */}
      {empty && (
        <div className="rounded-lg border border-dashed border-subtle p-10 text-center space-y-3">
          <Images size={36} className="mx-auto text-muted" />
          <h2 className="t-subsection-title">Nothing here yet</h2>
          <p className="text-sm text-muted max-w-sm mx-auto">
            Photos you capture with a score card, add to your gear, or shoot in a pellet test all land here —
            ready to submit to leagues, clubs and events.
          </p>
          <Link to="/quick-capture" className="btn btn-primary inline-flex">
            <Camera size={15} /> Capture your first card
          </Link>
        </div>
      )}

      {/* No matches for this filter */}
      {!isLoading && !isError && items.length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-subtle bg-surface-hover p-8 text-center">
          <p className="text-sm text-muted">Nothing matches this filter.</p>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 u-stagger">
          {filtered.map((item) => {
            const Icon = kindIcon(item.kind)
            return (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() => setActive(item)}
                className="group relative overflow-hidden rounded-lg border border-subtle bg-surface text-left shadow-card u-lift"
                aria-label={`${kindLabel(item.kind)}: ${item.title}`}
              >
                <div className="aspect-square overflow-hidden bg-surface-hover">
                  <GalleryImage
                    item={item}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
                    <Icon size={10} /> {kindLabel(item.kind)}
                  </span>
                </div>
                <div className="absolute right-1.5 top-1.5">
                  <StatusPill item={item} />
                </div>
                <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/75 to-transparent p-2 pt-8">
                  {item.kind === 'score_card' ? (
                    <div className="flex items-end justify-between gap-2">
                      <span className="text-base font-semibold leading-none text-white u-tnum">
                        {item.total_score}
                        <span className="ml-1 text-[10px] font-normal text-white/70">{item.x_count}X</span>
                      </span>
                      <span className="text-[10px] text-white/70">{formatDateShort(item.shot_at, prefs)}</span>
                    </div>
                  ) : (
                    <div className="truncate text-xs font-medium text-white">{item.title}</div>
                  )}
                  <SubmissionBadges item={item} compact />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Item detail overlay */}
      {active && (
        <ItemOverlay
          item={active}
          prefs={prefs}
          onClose={() => setActive(null)}
          onSubmitToLeague={() => setLeagueDialogFor(active.id)}
          onSubmitToEvent={() => setEventDialogFor(active.id)}
          onWithdraw={() => setWithdrawFor(active)}
        />
      )}

      <SubmitToLeagueDialog
        open={leagueDialogFor != null}
        scoreCardId={leagueDialogFor ?? ''}
        onClose={() => setLeagueDialogFor(null)}
        onSuccess={refreshGallery}
      />
      <SubmitToEventDialog
        open={eventDialogFor != null}
        scoreCardId={eventDialogFor ?? ''}
        onClose={() => setEventDialogFor(null)}
        onSuccess={refreshGallery}
      />
      <ConfirmDialog
        open={withdrawFor != null}
        title="Withdraw from event"
        message={`Take this card out of ${withdrawFor?.event_name ?? 'the event'}? It stays in your gallery as a personal card and can be submitted again.`}
        confirmLabel="Withdraw"
        confirmDisabled={withdrawMutation.isPending}
        onConfirm={() => withdrawFor && withdrawMutation.mutate(withdrawFor.id)}
        onCancel={() => setWithdrawFor(null)}
      />
    </div>
  )
}

function ItemOverlay({
  item,
  prefs,
  onClose,
  onSubmitToLeague,
  onSubmitToEvent,
  onWithdraw,
}: {
  item: GalleryItem
  prefs: ReturnType<typeof useRegionalPrefs>
  onClose: () => void
  onSubmitToLeague: () => void
  onSubmitToEvent: () => void
  onWithdraw: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useDialogFocus({ dialogRef, initialFocusRef: closeRef, onClose })

  const link = itemLink(item)
  const isCard = item.kind === 'score_card'
  const inLeague = Boolean(item.league_round_id)
  const inEvent = Boolean(item.event_participant_id)

  const meta: { label: string; value: string }[] = []
  if (item.shot_at) meta.push({ label: item.kind === 'pellet_test' ? 'Tested' : 'Shot', value: formatDateShort(item.shot_at, prefs) })
  if (item.rifle_name) meta.push({ label: 'Rifle', value: item.rifle_name })
  if (item.pellet_name) meta.push({ label: 'Pellets', value: item.pellet_name })
  if (item.group_size_mm != null) meta.push({ label: 'Group', value: `${item.group_size_mm.toFixed(1)} mm` })
  meta.push({ label: 'Uploaded', value: formatDateShort(item.created_at, prefs) })

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg overflow-hidden rounded-lg border border-subtle bg-surface shadow-xl animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label={`${kindLabel(item.kind)}: ${item.title}`}
      >
        <div className="relative bg-black/90">
          <GalleryImage item={item} className="mx-auto max-h-[45vh] w-auto object-contain" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          >
            <X size={16} />
          </button>
          {isCard && (
            <div className="absolute bottom-2 left-3 text-white">
              <span className="text-2xl font-semibold u-tnum">{item.total_score}</span>
              <span className="ml-1.5 text-xs text-white/70">{item.x_count}X</span>
            </div>
          )}
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="t-subsection-title truncate">
                {isCard ? (item.rifle_name ?? 'Score card') : item.title}
              </h3>
              {item.caption && <p className="mt-0.5 text-sm text-muted">{item.caption}</p>}
            </div>
            <StatusPill item={item} />
          </div>

          <SubmissionBadges item={item} />
          {isCard && !isSubmitted(item) && !item.is_draft && (
            <p className="text-xs text-muted">Not submitted anywhere yet — enter it into a league or event below.</p>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {meta.map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-2 border-b border-subtle/60 pb-1">
                <dt className="text-muted">{label}</dt>
                <dd className="truncate text-secondary">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Link
              to={link.to}
              params={link.params}
              search={link.search as never}
              onClick={onClose}
              className="btn btn-secondary btn-sm"
            >
              {link.label}
            </Link>
            {isCard && !inEvent && (
              <button type="button" onClick={onSubmitToLeague} className="btn btn-secondary btn-sm">
                <Trophy size={13} /> {inLeague ? 'Move league' : 'Submit to league'}
              </button>
            )}
            {isCard && !inLeague && !inEvent && (
              <button type="button" onClick={onSubmitToEvent} className="btn btn-primary btn-sm">
                <CalendarClock size={13} /> Submit to event
              </button>
            )}
            {isCard && inEvent && !item.is_draft && (
              <button type="button" onClick={onWithdraw} className="btn btn-danger btn-sm">
                Withdraw from event
              </button>
            )}
          </div>
          {isCard && inEvent && item.is_draft && (
            <p className="text-right text-xs text-muted">
              This draft is entered at {item.event_name ?? 'an event'} — finish it from the refine flow.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
