import { useEffect } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Lock } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { scoreCardApi } from '../api/scoreCards'
import { pelletTestApi } from '../api/pelletTesting'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { usersApi } from '../api/users'
import { ApiError } from '../api/client'
import { formatDate, useRegionalPrefs } from '../utils/date'
import { ShareDialog, ShareTargetType } from '../components/ShareDialog'
import { Share2 } from 'lucide-react'
import { useState } from 'react'

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
  return useAuthStore((s) => !!(s.accessToken || s.refreshToken))
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
    return <PrivateOrMissing type={type} />
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
      return <PrivateOrMissing type={type} />
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
            className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary flex items-center gap-1"
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
        <h1 className="text-sm font-medium tracking-widest uppercase text-secondary">{title}</h1>
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

function PrivateOrMissing({ type }: { type: ShareTargetType }) {
  return (
    <Shell title={labels[type]}>
      <div className="bg-surface border border-subtle rounded-lg p-6 text-center space-y-2">
        <Lock size={20} className="mx-auto text-muted" />
        <p className="text-sm text-secondary">This {labels[type].toLowerCase()} is private.</p>
        <p className="text-xs text-muted">
          The owner may have set their profile or this item to private.
        </p>
      </div>
    </Shell>
  )
}

function LoadingShell({ type }: { type: ShareTargetType }) {
  return (
    <Shell title={labels[type]}>
      <p className="text-sm text-muted">Loading…</p>
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
  const { data: card, isLoading, error } = useQuery({
    queryKey: ['public-score-card', id],
    queryFn: () => scoreCardApi.get(id),
    retry: false,
  })

  if (isLoading) return <LoadingShell type="score_card" />
  if (error || !card) return <PrivateOrMissing type="score_card" />

  return (
    <Shell title="Score card">
      <article className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] tracking-widest uppercase text-muted">Total score</p>
            <p className="text-3xl font-mono font-semibold text-secondary">
              {card.total_score}
              {card.x_count > 0 && (
                <span className="text-sm text-muted ml-2">({card.x_count}X)</span>
              )}
            </p>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary flex items-center gap-1.5"
          >
            <Share2 size={14} />
            Share
          </button>
        </div>
        {card.location && (
          <p className="text-sm text-muted">{card.location}</p>
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
      {showShare && (
        <ShareDialog
          targetId={id}
          targetType="score_card"
          targetLabel={`${card.total_score} points`}
          onClose={() => setShowShare(false)}
        />
      )}
    </Shell>
  )
}

function PublicPelletTest({ id }: { id: string }) {
  const [showShare, setShowShare] = useState(false)
  const prefs = useRegionalPrefs()
  const { data: session, isLoading, error } = useQuery({
    queryKey: ['public-pellet-test', id],
    queryFn: () => pelletTestApi.get(id),
    retry: false,
  })

  if (isLoading) return <LoadingShell type="pellet_test" />
  if (error || !session) {
    if (isNotFound(error)) return <PrivateOrMissing type="pellet_test" />
    return <PrivateOrMissing type="pellet_test" />
  }

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
            className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary flex items-center gap-1.5"
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
      {showShare && (
        <ShareDialog
          targetId={id}
          targetType="pellet_test"
          targetLabel={pelletLabel}
          onClose={() => setShowShare(false)}
        />
      )}
    </Shell>
  )
}

function PublicLeague({ id }: { id: string }) {
  const [showShare, setShowShare] = useState(false)
  const { data: league, isLoading, error } = useQuery({
    queryKey: ['public-league', id],
    queryFn: () => leagueApi.get(id),
    retry: false,
  })

  if (isLoading) return <LoadingShell type="league" />
  if (error || !league) return <PrivateOrMissing type="league" />

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
            className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary flex items-center gap-1.5"
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
          onClose={() => setShowShare(false)}
        />
      )}
    </Shell>
  )
}

function PublicClub({ id }: { id: string }) {
  const [showShare, setShowShare] = useState(false)
  const { data: club, isLoading, error } = useQuery({
    queryKey: ['public-club', id],
    queryFn: () => clubsApi.get(id),
    retry: false,
  })

  if (isLoading) return <LoadingShell type="club" />
  if (error || !club) return <PrivateOrMissing type="club" />

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
            className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary flex items-center gap-1.5"
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
          onClose={() => setShowShare(false)}
        />
      )}
    </Shell>
  )
}

function PublicUser({ id }: { id: string }) {
  const [showShare, setShowShare] = useState(false)
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['public-user', id],
    queryFn: () => usersApi.getProfile(id),
    retry: false,
  })

  if (isLoading) return <LoadingShell type="user" />
  if (error || !profile) return <PrivateOrMissing type="user" />
  if (profile.is_private || profile.profile_visibility === 'private') {
    return <PrivateOrMissing type="user" />
  }

  return (
    <Shell title="Profile">
      <article className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              className="w-14 h-14 rounded-full object-cover border border-subtle"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-surface-hover border border-subtle flex items-center justify-center text-muted text-lg font-medium">
              {profile.display_name[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="flex-1">
            <p className="text-base font-medium text-secondary">{profile.display_name}</p>
            {profile.location && (
              <p className="text-xs text-muted">{profile.location}</p>
            )}
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary flex items-center gap-1.5"
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
