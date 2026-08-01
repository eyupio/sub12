import { useEffect } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Lock } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { scoreCardApi, type ScoreCardAuthor, type ScoreCardAchievement } from '../api/scoreCards'
import { pelletTestApi } from '../api/pelletTesting'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { usersApi } from '../api/users'
import { ApiError } from '../api/client'
import { formatDate, useRegionalPrefs } from '../utils/date'
import { identiconDataUri } from '../utils/identicon'
import { useDocumentMeta } from '../utils/useDocumentMeta'
import { ShareDialog, ShareTargetType } from '../components/ShareDialog'
import { LocationMapThumbnail } from '../components/LocationMapThumbnail'
import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { SkeletonList } from '../components/Skeleton'

// SharedView is the public landing page for every shareable URL. Logged-in
// users are redirected to the full in-app experience; anonymous visitors get
// a minimal read-only preview plus a sign-in CTA.
//
// Backed by endpoints that are already OptionalAuthenticate so the fetches
// succeed without a token. If the item is private or the owner is private,
// the API returns 404 — we render a "This page is private" state without
// bouncing to /login.

interface SharedViewProps {
  type: ShareTargetType
}

function useIsAuthed(): boolean {
  return useAuthStore((s) => !!(s.accessToken || s.user))
}

const inAppPath: Record<ShareTargetType, (id: string) => string> = {
  score_card: (id) => `/scores/${id}`,
  pellet_test: (id) => `/pellet-testing/${id}`,
  league: (id) => `/leagues/${id}`,
  club: (id) => `/clubs/${id}`,
  user: (id) => `/users/${id}`,
}

const labels: Record<ShareTargetType, string> = {
  score_card: 'Score card',
  pellet_test: 'Pellet test',
  league: 'League',
  club: 'Club',
  user: 'Profile',
}

export const SharedScoreCardView = () => <SharedView type="score_card" />
export const SharedPelletTestView = () => <SharedView type="pellet_test" />
export const SharedLeagueView = () => <SharedView type="league" />
export const SharedClubView = () => <SharedView type="club" />
export const SharedUserView = () => <SharedView type="user" />

export default function SharedView({ type }: SharedViewProps) {
  const { id } = useParams({ strict: false }) as { id?: string }
  const isAuthed = useIsAuthed()
  const navigate = useNavigate()

  // Authenticated users get the full in-app experience. We do this before any
  // fetching to avoid a flash of the public view for signed-in users.
  useEffect(() => {
    if (isAuthed && id) {
      navigate({ to: inAppPath[type](id), replace: true })
    }
  }, [isAuthed, id, type, navigate])

  if (isAuthed) {
    return null
  }

  if (!id) {
    return <NotFoundOrPrivate type={type} />
  }

  return <PublicContent type={type} id={id} />
}

function PublicContent({ type, id }: { type: ShareTargetType; id: string }) {
  switch (type) {
    case 'score_card':
      return <PublicScoreCard id={id} />
    case 'pellet_test':
      return <PublicPelletTest id={id} />
    case 'league':
      return <PublicLeague id={id} />
    case 'club':
      return <PublicClub id={id} />
    case 'user':
      return <PublicUser id={id} />
    default:
      return <NotFoundOrPrivate type={type} />
  }
}

// ── Shell & CTAs ─────────────────────────────────────────────────────────────

function Shell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-subtle bg-surface">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="t-section-title hover:text-secondary flex items-center gap-1"
          >
            <ChevronLeft size={14} />
            sub-12
          </Link>
          <Link
            to="/login"
            className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <h1 className="t-page-title">{title}</h1>
        {children}
      </main>
      <SignInCTA />
    </div>
  )
}

function SignInCTA() {
  return (
    <section className="max-w-2xl mx-auto px-4 pb-10">
      <div className="bg-surface border border-subtle rounded-lg p-4 text-center space-y-2">
        <p className="text-sm text-secondary">Want to comment, follow, or share your own?</p>
        <div className="flex justify-center gap-2">
          <Link
            to="/register"
            className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium"
          >
            Create account
          </Link>
          <Link
            to="/login"
            className="px-4 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  )
}

function NotFoundOrPrivate({ type }: { type: ShareTargetType }) {
  const label = labels[type].toLowerCase()
  return (
    <Shell title={labels[type]}>
      <div className="bg-surface border border-subtle rounded-lg p-6 text-center space-y-2">
        <Lock size={20} className="mx-auto text-muted" />
        <p className="text-sm text-secondary">This {label} isn't available.</p>
        <p className="text-xs text-muted">
          It may have been removed, set to private, or the owner's profile is private.
        </p>
      </div>
    </Shell>
  )
}

function TemporarilyUnavailable({
  type,
  onRetry,
}: {
  type: ShareTargetType
  onRetry: () => void
}) {
  const label = labels[type].toLowerCase()
  return (
    <Shell title={labels[type]}>
      <div className="bg-surface border border-subtle rounded-lg p-6 text-center space-y-3">
        <p className="text-sm text-secondary">We couldn't load this {label}.</p>
        <p className="text-xs text-muted">Check your connection and try again in a moment.</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:bg-surface-hover"
        >
          Retry
        </button>
      </div>
    </Shell>
  )
}

function LoadingShell({ type }: { type: ShareTargetType }) {
  return (
    <Shell title={labels[type]}>
      <SkeletonList count={3} />
    </Shell>
  )
}

function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}

// ── Per-type public views ────────────────────────────────────────────────────

function PublicScoreCard({ id }: { id: string }) {
  const [showShare, setShowShare] = useState(false)
  const prefs = useRegionalPrefs()
  const { data: card, isLoading, error, refetch } = useQuery({
    queryKey: ['public-score-card', id],
    queryFn: () => scoreCardApi.get(id),
    retry: false,
  })

  const scoreLabel = card
    ? card.x_count > 0
      ? `${card.total_score} (${card.x_count}X)`
      : String(card.total_score)
    : ''
  useDocumentMeta({
    title: card
      ? card.author?.display_name
        ? `${card.author.display_name} — ${scoreLabel}`
        : `Score card — ${scoreLabel}`
      : 'Score card',
    type: 'article',
    description: card
      ? `${card.author?.display_name ? `${card.author.display_name} shot ` : ''}${scoreLabel}${card.location ? ` at ${card.location}` : ''} on sub-12`
      : undefined,
  })

  if (isLoading) return <LoadingShell type="score_card" />
  if (error) {
    if (isNotFound(error)) return <NotFoundOrPrivate type="score_card" />
    return <TemporarilyUnavailable type="score_card" onRetry={() => refetch()} />
  }
  if (!card) return <NotFoundOrPrivate type="score_card" />

  const author = card.author
  const achievements = card.achievements ?? []

  return (
    <Shell title="Score card">
      {author && <PublicAuthorHeader author={author} achievements={achievements} />}
      <article className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="t-section-title">Total score</p>
            <p className="text-3xl font-mono font-semibold text-secondary">
              {card.total_score}
              {card.x_count > 0 && (
                <span className="text-sm text-muted ml-2">({card.x_count}X)</span>
              )}
            </p>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-1.5 rounded border border-subtle t-section-title hover:text-secondary flex items-center gap-1.5"
          >
            <Share2 size={14} />
            Share
          </button>
        </div>
        {card.location && (
          typeof card.location_lat === 'number' && typeof card.location_lng === 'number' ? (
            <LocationMapThumbnail
              label={card.location}
              lat={card.location_lat}
              lng={card.location_lng}
            />
          ) : (
            <p className="text-sm text-muted">{card.location}</p>
          )
        )}
        <p className="text-xs text-muted">{formatDate(card.shot_at, prefs)}</p>
        {card.card_image_url && (
          <img
            src={card.card_image_url}
            alt="Score card"
            className="w-full rounded border border-subtle"
          />
        )}
        <div className="grid grid-cols-5 gap-2 pt-2">
          {card.shot_scores.map((score, i) => {
            const x = card.shot_xs[i]
            const label = score === 10 && x ? 'X' : String(score)
            return (
              <div
                key={i}
                className="aspect-square rounded border border-subtle bg-surface-hover flex items-center justify-center font-mono font-semibold text-sm text-secondary"
              >
                {label}
              </div>
            )
          })}
        </div>
      </article>
      {showShare && (() => {
        const authorName = author?.display_name || ''
        const score = card.x_count > 0 ? `${card.total_score} (${card.x_count}X)` : String(card.total_score)
        const who = authorName ? `${authorName} shot ` : ''
        const where = card.location ? ` at ${card.location}` : ''
        const shareText = `${who}${score}${where} on sub-12`
        const shareTitle = authorName ? `${authorName} — ${score}` : score
        return (
          <ShareDialog
            targetId={id}
            targetType="score_card"
            targetLabel={`${card.total_score} points`}
            shareTitle={shareTitle}
            shareText={shareText}
            onClose={() => setShowShare(false)}
          />
        )
      })()}
    </Shell>
  )
}

// PublicAuthorHeader renders the score-card owner's attribution above the
// card itself so anonymous visitors can see who shot it. Clicking through
// lands on the owner's public share profile.
function PublicAuthorHeader({
  author,
  achievements,
}: {
  author: ScoreCardAuthor
  achievements: ScoreCardAchievement[]
}) {
  const top = achievements.slice(0, 6)
  const remaining = achievements.length - top.length
  return (
    <section className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
      <Link
        to="/share/users/$id"
        params={{ id: author.id }}
        className="flex items-center gap-3 group"
      >
        <img
          src={author.avatar_url || identiconDataUri(author.id || author.display_name || '')}
          alt={author.display_name}
          className="w-12 h-12 rounded-full object-cover border border-subtle"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-secondary group-hover:text-[var(--brass)] transition-colors truncate">
            {author.display_name}
          </p>
          {(author.location || author.star_level > 0) && (
            <p className="text-[11px] text-muted truncate">
              {[author.location, author.star_level > 0 ? `★ ${author.star_level}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      </Link>
      {top.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-subtle pt-3">
          {top.map((a) => (
            <span
              key={a.id}
              title={a.name}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--brass)]/30 bg-[var(--brass)]/10 px-2 py-0.5 text-[10px] tracking-widest uppercase text-[var(--brass)]"
            >
              {a.icon && <span aria-hidden className="text-xs leading-none">{a.icon}</span>}
              <span className="truncate max-w-[10rem]">{a.name}</span>
            </span>
          ))}
          {remaining > 0 && (
            <span className="inline-flex items-center rounded-full border border-subtle px-2 py-0.5 text-[10px] tracking-widest uppercase text-muted">
              +{remaining}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

function PublicPelletTest({ id }: { id: string }) {
  const [showShare, setShowShare] = useState(false)
  const prefs = useRegionalPrefs()
  const { data: session, isLoading, error, refetch } = useQuery({
    queryKey: ['public-pellet-test', id],
    queryFn: () => pelletTestApi.get(id),
    retry: false,
  })

  useDocumentMeta({
    title: session?.pellet
      ? `${session.pellet.brand} ${session.pellet.model}`.trim()
      : 'Pellet test',
    type: 'article',
    description: session
      ? [
          session.pellet ? `${session.pellet.brand} ${session.pellet.model}`.trim() : 'Pellet test',
          session.best_group_size_mm != null ? `best ${session.best_group_size_mm.toFixed(2)}mm` : null,
          session.distance_m > 0 ? `${session.distance_m.toFixed(1)}m` : null,
        ]
          .filter(Boolean)
          .join(' · ') + ' on sub-12'
      : undefined,
  })

  if (isLoading) return <LoadingShell type="pellet_test" />
  if (error) {
    if (isNotFound(error)) return <NotFoundOrPrivate type="pellet_test" />
    return <TemporarilyUnavailable type="pellet_test" onRetry={() => refetch()} />
  }
  if (!session) return <NotFoundOrPrivate type="pellet_test" />

  const pelletLabel = session.pellet
    ? `${session.pellet.brand} ${session.pellet.model}`.trim()
    : 'Pellet test'

  return (
    <Shell title="Pellet test">
      <article className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-medium text-secondary">{pelletLabel}</p>
            {session.rifle && (
              <p className="text-xs text-muted">
                {session.rifle.make} {session.rifle.model}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-1.5 rounded border border-subtle t-section-title hover:text-secondary flex items-center gap-1.5"
          >
            <Share2 size={14} />
            Share
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat label="Distance" value={`${session.distance_m.toFixed(1)}m`} />
          <Stat
            label="Best group"
            value={session.best_group_size_mm != null ? `${session.best_group_size_mm.toFixed(2)}mm` : '—'}
          />
          <Stat
            label="Average"
            value={session.average_group_size_mm != null ? `${session.average_group_size_mm.toFixed(2)}mm` : '—'}
          />
        </div>

        <p className="text-xs text-muted">{formatDate(session.test_date, prefs)}</p>

        {session.location && (
          typeof session.location_lat === 'number' && typeof session.location_lng === 'number' ? (
            <LocationMapThumbnail
              label={session.location}
              lat={session.location_lat}
              lng={session.location_lng}
            />
          ) : (
            <p className="text-sm text-muted">{session.location}</p>
          )
        )}

        {session.images && session.images.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {session.images.slice(0, 4).map((img) => (
              <img
                key={img.id}
                src={img.image_url}
                alt={img.caption ?? 'Group target'}
                className="w-full rounded border border-subtle object-cover"
              />
            ))}
          </div>
        )}
      </article>
      {showShare && (() => {
        const rifleName = session.rifle ? `${session.rifle.make} ${session.rifle.model}`.trim() : ''
        const bits: string[] = []
        bits.push(session.pellet ? `Pellet test: ${pelletLabel}` : 'Pellet test')
        if (session.best_group_size_mm != null) bits.push(`Best ${session.best_group_size_mm.toFixed(2)}mm`)
        if (session.distance_m > 0) bits.push(`${session.distance_m.toFixed(1)}m`)
        if (rifleName) bits.push(rifleName)
        const shareText = `${bits.join(' · ')} on sub-12`
        const shareTitle = session.pellet ? `Pellet test: ${pelletLabel}` : 'Pellet test'
        return (
          <ShareDialog
            targetId={id}
            targetType="pellet_test"
            targetLabel={pelletLabel}
            shareTitle={shareTitle}
            shareText={shareText}
            onClose={() => setShowShare(false)}
          />
        )
      })()}
    </Shell>
  )
}

function PublicLeague({ id }: { id: string }) {
  const [showShare, setShowShare] = useState(false)
  const { data: league, isLoading, error, refetch } = useQuery({
    queryKey: ['public-league', id],
    queryFn: () => leagueApi.get(id),
    retry: false,
  })

  useDocumentMeta({
    title: league ? league.name : 'League',
    description: league
      ? league.description?.trim()
        ? league.description.trim().slice(0, 200)
        : `${league.name} — ${league.member_count} member${league.member_count === 1 ? '' : 's'} on sub-12`
      : undefined,
  })

  if (isLoading) return <LoadingShell type="league" />
  if (error) {
    if (isNotFound(error)) return <NotFoundOrPrivate type="league" />
    return <TemporarilyUnavailable type="league" onRetry={() => refetch()} />
  }
  if (!league) return <NotFoundOrPrivate type="league" />

  return (
    <Shell title="League">
      <article className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        {league.image_url && (
          <img
            src={league.image_url}
            alt={league.name}
            className="w-full rounded border border-subtle aspect-video object-cover"
          />
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-medium text-secondary">{league.name}</p>
            <p className="text-xs text-muted">
              {league.member_count} member{league.member_count === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-1.5 rounded border border-subtle t-section-title hover:text-secondary flex items-center gap-1.5"
          >
            <Share2 size={14} />
            Share
          </button>
        </div>
        {league.description && (
          <p className="text-sm text-secondary whitespace-pre-line">{league.description}</p>
        )}
      </article>
      {showShare && (
        <ShareDialog
          targetId={id}
          targetType="league"
          targetLabel={league.name}
          shareTitle={league.name}
          shareText={`Join ${league.name} on sub-12 — ${league.member_count} member${league.member_count === 1 ? '' : 's'}`}
          onClose={() => setShowShare(false)}
        />
      )}
    </Shell>
  )
}

function PublicClub({ id }: { id: string }) {
  const [showShare, setShowShare] = useState(false)
  const { data: club, isLoading, error, refetch } = useQuery({
    queryKey: ['public-club', id],
    queryFn: () => clubsApi.get(id),
    retry: false,
  })

  useDocumentMeta({
    title: club ? club.name : 'Club',
    description: club
      ? club.description?.trim()
        ? club.description.trim().slice(0, 200)
        : `${club.name} — ${club.member_count} member${club.member_count === 1 ? '' : 's'} on sub-12`
      : undefined,
  })

  if (isLoading) return <LoadingShell type="club" />
  if (error) {
    if (isNotFound(error)) return <NotFoundOrPrivate type="club" />
    return <TemporarilyUnavailable type="club" onRetry={() => refetch()} />
  }
  if (!club) return <NotFoundOrPrivate type="club" />

  return (
    <Shell title="Club">
      <article className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        {club.image_url && (
          <img
            src={club.image_url}
            alt={club.name}
            className="w-full rounded border border-subtle aspect-video object-cover"
          />
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-medium text-secondary">{club.name}</p>
            <p className="text-xs text-muted">
              {club.member_count} member{club.member_count === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-1.5 rounded border border-subtle t-section-title hover:text-secondary flex items-center gap-1.5"
          >
            <Share2 size={14} />
            Share
          </button>
        </div>
        {club.description && (
          <p className="text-sm text-secondary whitespace-pre-line">{club.description}</p>
        )}
      </article>
      {showShare && (
        <ShareDialog
          targetId={id}
          targetType="club"
          targetLabel={club.name}
          shareTitle={club.name}
          shareText={`${club.name} on sub-12 — ${club.member_count} member${club.member_count === 1 ? '' : 's'}`}
          onClose={() => setShowShare(false)}
        />
      )}
    </Shell>
  )
}

function PublicUser({ id }: { id: string }) {
  const [showShare, setShowShare] = useState(false)
  const { data: profile, isLoading, error, refetch } = useQuery({
    queryKey: ['public-user', id],
    queryFn: () => usersApi.getProfile(id),
    retry: false,
  })

  // Only expose identifying metadata for profiles that are actually public, so a
  // private profile's name/bio never leaks into the page title or share tags.
  const publicProfile =
    profile && !profile.is_private && profile.profile_visibility !== 'private' ? profile : null
  useDocumentMeta({
    title: publicProfile ? publicProfile.display_name : 'Profile',
    type: 'profile',
    description: publicProfile
      ? publicProfile.bio?.trim()
        ? publicProfile.bio.trim().slice(0, 200)
        : `${publicProfile.display_name}${publicProfile.location ? ` · ${publicProfile.location}` : ''} on sub-12`
      : undefined,
  })

  if (isLoading) return <LoadingShell type="user" />
  if (error) {
    if (isNotFound(error)) return <NotFoundOrPrivate type="user" />
    return <TemporarilyUnavailable type="user" onRetry={() => refetch()} />
  }
  if (!profile) return <NotFoundOrPrivate type="user" />
  if (profile.is_private || profile.profile_visibility === 'private') {
    return <NotFoundOrPrivate type="user" />
  }

  return (
    <Shell title="Profile">
      <article className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <img
            src={profile.avatar_url || identiconDataUri(profile.id || profile.display_name || '')}
            alt={profile.display_name}
            className="w-14 h-14 rounded-full object-cover border border-subtle"
          />
          <div className="flex-1">
            <p className="text-base font-medium text-secondary">{profile.display_name}</p>
            {profile.location && (
              <p className="text-xs text-muted">{profile.location}</p>
            )}
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-1.5 rounded border border-subtle t-section-title hover:text-secondary flex items-center gap-1.5"
          >
            <Share2 size={14} />
            Share
          </button>
        </div>
        {profile.bio && (
          <p className="text-sm text-secondary whitespace-pre-line">{profile.bio}</p>
        )}
      </article>
      {showShare && (
        <ShareDialog
          targetId={id}
          targetType="user"
          targetLabel={profile.display_name}
          shareTitle={profile.display_name}
          shareText={profile.location
            ? `${profile.display_name} on sub-12 · ${profile.location}`
            : `${profile.display_name} on sub-12`}
          onClose={() => setShowShare(false)}
        />
      )}
    </Shell>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-hover rounded p-2 border border-subtle">
      <p className="text-[10px] tracking-widest uppercase text-muted">{label}</p>
      <p className="text-sm font-mono text-secondary">{value}</p>
    </div>
  )
}
