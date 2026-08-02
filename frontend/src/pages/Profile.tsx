import { useState, useRef, useMemo, type FormEvent } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Pencil, X, Check, MapPin, Users, Camera, Mail, Lock, Globe,
  UserCheck, UserX, Ruler, CalendarDays, ShieldCheck, ShieldOff,
  Bell, Users2, BarChart2, KeyRound, Copy, Download, Trash2,
  Search, UserMinus, CheckSquare, Square,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuthStore } from '../store/auth'
import { statsApi } from '../api/stats'
import { scoreCardApi } from '../api/scoreCards'
import { usersApi, type UpdateProfileInput, type FollowListItem } from '../api/users'
import { achievementApi } from '../api/achievements'
import { gearApi } from '../api/gear'
import { twoFactorApi, type EnrollBeginResponse } from '../api/twoFactor'
import { privacyApi } from '../api/privacy'
import { ApiError } from '../api/client'
import { RifleProfileCard } from '../components/RifleProfileCard'
import { AchievementsSection } from '../components/AchievementsSection'
import { NotificationPreferencesPanel } from '../components/NotificationPreferencesPanel'
import { StarBadge } from '../components/StarBadge'
import { UserAvatar } from '../components/UserAvatar'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ImageEditor } from '../components/ImageEditor'
import { toast } from '../store/toast'
import { DATE_FORMAT_OPTIONS, DEFAULT_PREFS, formatDate, type DateFormat, type TimeFormat } from '../utils/date'
import { identiconDataUri, identiconPngFile, randomIdenticonSeed } from '../utils/identicon'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { PageGrid, PageHeader } from '../components/leagues'
import '../components/leagues/styles.css'
import { SkeletonList } from '../components/Skeleton'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileTab = 'overview' | 'edit' | 'privacy' | 'notifications' | 'security' | 'social'

const TABS: Array<{ key: ProfileTab; label: string; icon: React.ElementType }> = [
  { key: 'overview',      label: 'Overview',      icon: BarChart2 },
  { key: 'edit',          label: 'Edit Profile',   icon: Pencil },
  { key: 'privacy',       label: 'Privacy',        icon: Lock },
  { key: 'notifications', label: 'Notifications',  icon: Bell },
  { key: 'security',      label: 'Security',       icon: ShieldCheck },
  { key: 'social',        label: 'Social',         icon: Users2 },
]

// ─── Shared sub-components ────────────────────────────────────────────────────

function StatCard({ label, value, gold, to, params }: { label: string; value: string; gold?: boolean; to?: string; params?: Record<string, string> }) {
  const inner = (
    <>
      <p className="text-[10px] tracking-widest uppercase text-muted">{label}</p>
      <p className={`text-2xl lg:text-3xl font-mono font-normal mt-1 ${gold ? 'text-[var(--brass)]' : 'text-secondary'}`}>
        {value}
      </p>
    </>
  )
  if (to) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Link to={to as any} params={params as any} className="bg-surface border border-subtle rounded-lg p-4 lg:p-5 block hover:border-line-2 transition-colors">
        {inner}
      </Link>
    )
  }
  return (
    <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-5">
      {inner}
    </div>
  )
}

function AvatarUpload() {
  const { user, updateUser } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingFile, setEditingFile] = useState<File | null>(null)

  const avatarMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: (updated) => {
      updateUser({ avatar_url: updated.avatar_url })
    },
  })

  const removeAvatarMutation = useMutation({
    mutationFn: () => usersApi.removeAvatar(),
    onSuccess: (updated) => {
      updateUser({ avatar_url: updated.avatar_url })
    },
  })

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const file = await identiconPngFile(randomIdenticonSeed())
      return usersApi.uploadAvatar(file)
    },
    onSuccess: (updated) => {
      updateUser({ avatar_url: updated.avatar_url })
    },
    onError: () => {
      toast('Could not regenerate avatar — please try again.', 'error')
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setEditingFile(file)
  }

  function onEdited(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be under 5 MB', 'error')
      setEditingFile(null)
      return
    }
    setEditingFile(null)
    avatarMutation.mutate(file)
  }

  return (
    <div className="relative group">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={avatarMutation.isPending || regenerateMutation.isPending}
        className="relative rounded-full overflow-hidden hover:ring-2 hover:ring-[var(--brass)]/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Change profile picture"
      >
        <UserAvatar
          user={user ?? {}}
          size={96}
          className="border-2"
          showHoverCard={false}
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
          <Camera size={20} className="text-white" />
        </div>
      </button>
      <button
        onClick={() => regenerateMutation.mutate()}
        disabled={regenerateMutation.isPending || avatarMutation.isPending}
        className="block mx-auto text-[10px] text-muted hover:text-secondary transition-colors disabled:opacity-50 mt-1"
      >
        {regenerateMutation.isPending ? 'Generating…' : 'Regenerate avatar'}
      </button>
      {user?.avatar_url && (
        <button
          onClick={() => removeAvatarMutation.mutate()}
          disabled={removeAvatarMutation.isPending}
          className="block mx-auto text-[10px] text-muted hover:text-secondary transition-colors disabled:opacity-50 mt-1"
        >
          {removeAvatarMutation.isPending ? 'Removing…' : 'Remove avatar'}
        </button>
      )}
      {avatarMutation.isPending && (
        <p className="text-[10px] text-muted mt-1 text-center">Uploading…</p>
      )}
      {avatarMutation.isError && (
        <p className="text-[10px] text-[var(--error-text)] mt-1 text-center">Failed</p>
      )}
      {!!user?.star_level && user?.id && (
        <div className="flex justify-center mt-1">
          <StarBadge
            level={user.star_level}
            size={10}
            userId={user.id}
            displayName={user.display_name}
            avatarUrl={user.avatar_url}
          />
        </div>
      )}
      {editingFile && (
        <ImageEditor
          file={editingFile}
          aspect={1}
          title="Edit avatar"
          onSave={onEdited}
          onCancel={() => setEditingFile(null)}
        />
      )}
    </div>
  )
}

// ─── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const { user } = useAuthStore()

  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => statsApi.getMe() })
  const { data: history } = useQuery({ queryKey: ['score-cards'], queryFn: () => scoreCardApi.list(5, 0) })
  const { data: achievementsData } = useQuery({ queryKey: ['achievements', 'me'], queryFn: () => achievementApi.listMine(), enabled: !!user })
  const { data: achievementDefsData } = useQuery({ queryKey: ['achievement-defs'], queryFn: () => achievementApi.listDefs(), staleTime: 5 * 60 * 1000 })
  const { data: riflesData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: rifleStatsData } = useQuery({ queryKey: ['rifle-stats'], queryFn: () => statsApi.getRifleStats() })

  const rifles = riflesData?.items ?? []
  const rifleStatsMap = new Map((rifleStatsData?.items ?? []).map(rs => [rs.rifle_id, rs]))
  const recentCards = history?.items ?? []

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div>
        <h2 className="t-section-title mb-3">Stats</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <StatCard
            label="Best Score"
            value={stats?.best_score != null ? String(stats.best_score) : '—'}
            gold
            to={stats?.best_score_card_id ? '/scores/$id' : undefined}
            params={stats?.best_score_card_id ? { id: stats.best_score_card_id } : undefined}
          />
          <StatCard label="Best X Count" value={stats?.best_x_count != null ? String(stats.best_x_count) : '—'} gold />
          <StatCard label="Cards Logged" value={stats ? String(stats.cards_logged) : '—'} />
          <StatCard label="Avg Score" value={stats?.avg_score != null ? stats.avg_score.toFixed(1) : '—'} />
        </div>
      </div>

      {/* My Rifles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="t-section-title">My Rifles</h2>
          <Link to="/gear" className="t-section-title hover:text-secondary transition-colors">
            Manage gear →
          </Link>
        </div>
        {rifles.length === 0 ? (
          <p className="text-sm text-muted tracking-wide">No rifles added yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rifles.map(r => (
              <RifleProfileCard key={r.id} rifle={r} stats={rifleStatsMap.get(r.id)} mode="profile" />
            ))}
          </div>
        )}
      </div>

      {/* Achievements */}
      <AchievementsSection
        earned={achievementsData?.items ?? []}
        allDefs={achievementDefsData?.items ?? []}
      />

      {/* Recent Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="t-section-title">Recent Cards</h2>
          {recentCards.length > 0 && (
            <Link to="/scores" className="t-section-title hover:text-secondary transition-colors">
              See all →
            </Link>
          )}
        </div>
        {recentCards.length === 0 ? (
          <p className="text-sm text-muted tracking-wide">No cards logged yet.</p>
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {recentCards.map((card) => (
              <Link
                key={card.id}
                to="/scores/$id"
                params={{ id: card.id }}
                className="flex items-center justify-between p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
              >
                <div>
                  <p className="font-mono text-secondary text-sm">{card.shot_at}</p>
                  {card.location && <p className="text-[11px] text-muted">{card.location}</p>}
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-lg font-semibold text-primary">{card.total_score}</span>
                  {card.x_count > 0 && <span className="text-xs text-[var(--brass)]">{card.x_count}X</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Edit Profile ─────────────────────────────────────────────────────────

function EditTab() {
  const { user, updateUser } = useAuthStore()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<UpdateProfileInput>({
    display_name: user?.display_name ?? '',
    bio: user?.bio ?? '',
    location: user?.location ?? '',
    club: user?.club ?? '',
    profile_visibility: user?.profile_visibility ?? 'public',
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [emailEditing, setEmailEditing] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 placeholder-muted'

  const mutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      updateUser({
        display_name: updated.display_name,
        bio: updated.bio,
        location: updated.location,
        club: updated.club,
        profile_visibility: updated.profile_visibility,
        default_score_visibility: updated.default_score_visibility,
        feed_opt_out: updated.feed_opt_out,
        default_distance_unit: updated.default_distance_unit,
        default_measurement_unit: updated.default_measurement_unit,
      })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: () => setError('Failed to save changes. Please try again.'),
  })

  const emailChangeMutation = useMutation({
    mutationFn: (email: string) => usersApi.requestEmailChange(email),
    onSuccess: (result) => {
      setEmailMsg(result.message)
      setEmailError(null)
      setEmailEditing(false)
      setNewEmail('')
    },
    onError: (err) => {
      setEmailError(err instanceof Error ? err.message : 'Failed to request email change')
      setEmailMsg(null)
    },
  })

  const unitMutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      updateUser({
        default_distance_unit: updated.default_distance_unit,
        default_measurement_unit: updated.default_measurement_unit,
      })
      toast('Unit preferences saved', 'success')
    },
    onError: () => toast('Failed to save unit preferences', 'error'),
  })

  const regionalMutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      updateUser({ date_format: updated.date_format, time_format: updated.time_format, timezone: updated.timezone })
      toast('Regional preferences saved', 'success')
    },
    onError: () => toast('Failed to save regional preferences', 'error'),
  })

  const currentDateFormat = (user?.date_format as DateFormat | undefined) ?? DEFAULT_PREFS.dateFormat
  const currentTimeFormat = (user?.time_format as TimeFormat | undefined) ?? DEFAULT_PREFS.timeFormat
  const currentTimezone = user?.timezone || DEFAULT_PREFS.timezone

  const timezones: string[] = (() => {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
    if (typeof fn === 'function') return fn('timeZone')
    return ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']
  })()

  const toggleBtnCls = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      active ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse' : 'border-subtle text-muted hover:text-secondary'
    }`

  function handleSave() {
    const input: UpdateProfileInput = {}
    if (form.display_name !== undefined) input.display_name = form.display_name || undefined
    if (form.bio !== undefined) input.bio = form.bio || undefined
    if (form.location !== undefined) input.location = form.location || undefined
    if (form.club !== undefined) input.club = form.club || undefined
    if (form.profile_visibility !== undefined) input.profile_visibility = form.profile_visibility
    mutation.mutate(input)
  }

  return (
    <div className="space-y-6">
      {/* Identity */}
      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title"><Pencil size={12} /> Identity</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-5">
            <AvatarUpload />
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">Display Name</label>
                <input type="text" value={form.display_name ?? ''} onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))} className={inputCls} placeholder="Your name" />
              </div>
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">Bio</label>
                <textarea value={form.bio ?? ''} onChange={(e) => setForm(f => ({ ...f, bio: e.target.value }))} rows={2} className={`${inputCls} resize-none`} placeholder="A few words about you" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">Location</label>
                  <input type="text" value={form.location ?? ''} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} className={inputCls} placeholder="e.g. Yorkshire" />
                </div>
                <div>
                  <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">Club</label>
                  <input type="text" value={form.club ?? ''} onChange={(e) => setForm(f => ({ ...f, club: e.target.value }))} className={inputCls} placeholder="e.g. YHFTA" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">Profile Visibility</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm(f => ({ ...f, profile_visibility: 'public' }))} className={toggleBtnCls((form.profile_visibility ?? 'public') === 'public')}>
                    <Globe size={12} /> Public
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, profile_visibility: 'private' }))} className={toggleBtnCls((form.profile_visibility ?? 'public') === 'private')}>
                    <Lock size={12} /> Private
                  </button>
                </div>
                <p className="text-[10px] text-muted mt-1">
                  {(form.profile_visibility ?? 'public') === 'private'
                    ? 'Only your followers can see your full profile and activity.'
                    : 'Anyone can see your full profile and activity.'}
                </p>
              </div>
            </div>
          </div>
          {error && <p className="text-[var(--error-text)] text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-[var(--brass)] text-white text-[11px] tracking-widest uppercase font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={13} />
              {mutation.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Email */}
      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title"><Mail size={12} /> Email address</span>
          {!emailEditing && (
            <button onClick={() => { setEmailEditing(true); setNewEmail(''); setEmailMsg(null); setEmailError(null) }} className="lc-section-title hover:text-secondary transition-colors">
              Change
            </button>
          )}
        </div>
        <div className="p-5 space-y-2">
          <p className="text-sm text-secondary">{user?.email}</p>
          {emailEditing && (
            <div className="space-y-2">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="New email address" className={inputCls} />
              <div className="flex gap-2">
                <button
                  onClick={() => emailChangeMutation.mutate(newEmail)}
                  disabled={emailChangeMutation.isPending || !newEmail.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check size={13} />
                  {emailChangeMutation.isPending ? 'Sending…' : 'Send confirmation'}
                </button>
                <button onClick={() => { setEmailEditing(false); setEmailError(null) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle t-section-title hover:text-secondary transition-colors">
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          )}
          {emailMsg && <p className="text-xs text-[var(--brass)]">{emailMsg}</p>}
          {emailError && <p className="text-xs text-[var(--error-text)]">{emailError}</p>}
        </div>
      </div>

      {/* Unit Preferences */}
      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title"><Ruler size={12} /> Unit preferences</span>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] tracking-widest uppercase text-muted mb-2">Default Distance Unit</label>
            <div className="flex gap-2">
              {[{ value: 'meters', label: 'Meters' }, { value: 'yards', label: 'Yards' }].map(({ value, label }) => (
                <button key={value} type="button" onClick={() => unitMutation.mutate({ default_distance_unit: value })} disabled={unitMutation.isPending} className={toggleBtnCls((user?.default_distance_unit ?? 'meters') === value)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted mt-1">Used as the default when creating pellet tests and measurements.</p>
          </div>
          <div>
            <label className="block text-[10px] tracking-widest uppercase text-muted mb-2">Default Measurement Unit</label>
            <div className="flex gap-2">
              {[{ value: 'cm', label: 'cm' }, { value: 'mm', label: 'mm' }].map(({ value, label }) => (
                <button key={value} type="button" onClick={() => unitMutation.mutate({ default_measurement_unit: value })} disabled={unitMutation.isPending} className={toggleBtnCls((user?.default_measurement_unit ?? 'cm') === value)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted mt-1">Used for calibration distance in the measurement wizard.</p>
          </div>
        </div>
      </div>

      {/* Regional Preferences */}
      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title"><CalendarDays size={12} /> Regional preferences</span>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] tracking-widest uppercase text-muted mb-2">Date Format</label>
            <div className="flex flex-wrap gap-2">
              {DATE_FORMAT_OPTIONS.map(({ value, label }) => (
                <button key={value} type="button" onClick={() => regionalMutation.mutate({ date_format: value })} disabled={regionalMutation.isPending} className={toggleBtnCls(currentDateFormat === value)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted mt-1">
              Preview: {formatDate(new Date(), { dateFormat: currentDateFormat, timeFormat: currentTimeFormat, timezone: currentTimezone })}
            </p>
          </div>
          <div>
            <label className="block text-[10px] tracking-widest uppercase text-muted mb-2">Time Format</label>
            <div className="flex gap-2">
              {(['24h', '12h'] as const).map((v) => (
                <button key={v} type="button" onClick={() => regionalMutation.mutate({ time_format: v })} disabled={regionalMutation.isPending} className={toggleBtnCls(currentTimeFormat === v)}>
                  {v === '24h' ? '24-hour' : '12-hour'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="timezone-select" className="block text-[10px] tracking-widest uppercase text-muted mb-2">Timezone</label>
            <select
              id="timezone-select"
              value={currentTimezone}
              onChange={(e) => regionalMutation.mutate({ timezone: e.target.value })}
              disabled={regionalMutation.isPending}
              className="w-full max-w-xs px-3 py-1.5 rounded border border-subtle bg-surface text-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!timezones.includes(currentTimezone) && <option value={currentTimezone}>{currentTimezone}</option>}
              {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
            <p className="text-[10px] text-muted mt-1">Dates and times in the app are displayed in this timezone.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Privacy ──────────────────────────────────────────────────────────────

function PrivacyTab() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user, updateUser, clearAuth } = useAuthStore()

  const [profileVisibility, setProfileVisibility] = useState(user?.profile_visibility ?? 'public')
  const [defaultScoreVisibility, setDefaultScoreVisibility] = useState<'public' | 'followers' | 'private'>(
    (user?.default_score_visibility as 'public' | 'followers' | 'private') ?? 'public',
  )
  const [feedOptOut, setFeedOptOut] = useState<boolean>(user?.feed_opt_out ?? false)
  const [showFollowerCounts, setShowFollowerCounts] = useState<boolean>(user?.show_follower_counts ?? true)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const updateMutation = useMutation({
    mutationFn: () => usersApi.updateMe({
      profile_visibility: profileVisibility,
      default_score_visibility: defaultScoreVisibility,
      feed_opt_out: feedOptOut,
      show_follower_counts: showFollowerCounts,
    }),
    onSuccess: (updated) => {
      updateUser({
        profile_visibility: updated.profile_visibility,
        default_score_visibility: updated.default_score_visibility,
        feed_opt_out: updated.feed_opt_out,
        show_follower_counts: updated.show_follower_counts,
      })
      toast('Privacy settings saved', 'success')
    },
    onError: () => toast('Failed to save settings', 'error'),
  })

  const { data: blocks } = useQuery({ queryKey: ['blocks'], queryFn: () => usersApi.listBlocked() })
  const { data: mutes } = useQuery({ queryKey: ['mutes'], queryFn: () => privacyApi.listMuted() })

  const unblockMutation = useMutation({
    mutationFn: (id: string) => usersApi.unblock(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['blocks'] }); toast('User unblocked', 'success') },
  })

  const unmuteMutation = useMutation({
    mutationFn: (id: string) => privacyApi.unmute(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mutes'] }); toast('User unmuted', 'success') },
  })

  const exportMutation = useMutation({
    mutationFn: () => usersApi.exportMe(),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sub12-data-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast('Download started', 'success')
    },
    onError: () => toast('Failed to export data', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => usersApi.deleteMe(),
    onSuccess: () => {
      toast('Your account has been deleted', 'success')
      clearAuth()
      navigate({ to: '/' })
    },
    onError: () => toast('Failed to delete account', 'error'),
  })

  const toggleBtnCls = (active: boolean) =>
    `px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors ${
      active ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5' : 'border-subtle text-muted hover:text-secondary hover:border-[var(--brass)]/20'
    }`

  return (
    <div className="space-y-5">
      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title"><Lock size={12} /> Profile visibility</span>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={profileVisibility === 'private'} onChange={(e) => setProfileVisibility(e.target.checked ? 'private' : 'public')} className="mt-1" />
            <span className="text-sm text-secondary">
              <span className="flex items-center gap-1 font-medium"><Lock size={12} /> Private profile</span>
              <span className="text-xs text-muted block">Bio, location, club and achievements are hidden behind a follow request.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={!showFollowerCounts} onChange={(e) => setShowFollowerCounts(!e.target.checked)} className="mt-1" />
            <span className="text-sm text-secondary">
              <span className="font-medium">Hide follower / following counts</span>
              <span className="text-xs text-muted block">Still visible to you; other people see a dash.</span>
            </span>
          </label>
        </div>
      </div>

      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title">New score cards</span>
        </div>
        <div className="p-5">
          <p className="text-xs text-muted mb-3">New score cards will default to this visibility.</p>
          <div className="flex gap-1.5 flex-wrap">
            {(['public', 'followers', 'private'] as const).map((v) => (
              <button key={v} onClick={() => setDefaultScoreVisibility(v)} aria-pressed={defaultScoreVisibility === v} className={toggleBtnCls(defaultScoreVisibility === v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title">Activity feed</span>
        </div>
        <div className="p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={feedOptOut} onChange={(e) => setFeedOptOut(e.target.checked)} className="mt-1" />
            <span className="text-sm text-secondary">
              <span className="font-medium">Hide my activity from the public feed</span>
              <span className="text-xs text-muted block">Your followers still see your activity in their personalised feed.</span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {updateMutation.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title"><ShieldOff size={12} /> Blocked users</span>
        </div>
        <div className="p-5">
          {!blocks?.items.length ? (
            <p className="text-xs text-muted">You haven't blocked anyone.</p>
          ) : (
            <ul className="space-y-2">
              {blocks.items.map((b) => (
                <li key={b.blocked_id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-secondary truncate">{b.display_name}</span>
                  <button onClick={() => unblockMutation.mutate(b.blocked_id)} className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80">Unblock</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title">Muted users</span>
        </div>
        <div className="p-5">
          {!mutes?.items.length ? (
            <p className="text-xs text-muted">You haven't muted anyone.</p>
          ) : (
            <ul className="space-y-2">
              {mutes.items.map((m) => (
                <li key={m.muted_id} className="flex items-center justify-between gap-2">
                  <Link to="/users/$id" params={{ id: m.muted_id }} className="flex items-center gap-2 text-sm text-secondary truncate hover:text-[var(--brass)]">
                    <UserAvatar user={{ id: m.muted_id, display_name: m.display_name, avatar_url: m.avatar_url }} size={24} variant="plain" />
                    <span className="truncate">{m.display_name || m.muted_id}</span>
                  </Link>
                  <button onClick={() => unmuteMutation.mutate(m.muted_id)} className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80">Unmute</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title"><Download size={12} /> Your data</span>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted">Download a JSON copy of your profile, score cards, posts, clubs and leagues.</p>
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportMutation.isPending ? 'Preparing…' : 'Download my data'}
          </button>
        </div>
      </div>

      <div className="lc-section" style={{ borderColor: 'rgba(var(--error-rgb, 220, 38, 38), 0.25)' }}>
        <div className="lc-section-head">
          <span className="lc-section-title" style={{ color: 'var(--error-text)' }}><Trash2 size={12} /> Delete account</span>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted">
            Permanent. Your profile is removed, your score cards become anonymous, and you will no longer appear in other users' feeds or lists.
            Type <span className="font-mono">DELETE</span> to confirm.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="flex-1 bg-page border border-subtle rounded px-2 py-1.5 text-sm text-secondary focus:outline-none focus:border-[var(--error-text)]/40"
            />
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteConfirm !== 'DELETE' || deleteMutation.isPending}
              className="px-3 py-1.5 rounded bg-[var(--error-text)] text-white text-[11px] tracking-widest uppercase font-medium disabled:opacity-30"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Notifications ────────────────────────────────────────────────────────

function NotificationsTab() {
  return (
    <div className="space-y-5">
      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title"><Bell size={12} /> Notification preferences</span>
        </div>
        <div className="p-5">
          <NotificationPreferencesPanel />
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Security ─────────────────────────────────────────────────────────────

type EnrollStep = 'idle' | 'qr' | 'codes'
type DisableMode = 'password' | 'code'

function SecurityTab() {
  const queryClient = useQueryClient()
  const updateUser = useAuthStore((s) => s.updateUser)

  const { data: status, isLoading } = useQuery({ queryKey: ['2fa-status'], queryFn: () => twoFactorApi.getStatus() })

  const [enrollStep, setEnrollStep] = useState<EnrollStep>('idle')
  const [enrollData, setEnrollData] = useState<EnrollBeginResponse | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([])
  const [savedAck, setSavedAck] = useState(false)

  const [disableWarnOpen, setDisableWarnOpen] = useState(false)
  const [disableFormOpen, setDisableFormOpen] = useState(false)
  const [disableMode, setDisableMode] = useState<DisableMode>('password')
  const [disableSecret, setDisableSecret] = useState('')
  const [disableError, setDisableError] = useState<string | null>(null)

  const [regenOpen, setRegenOpen] = useState(false)
  const [regenCode, setRegenCode] = useState('')
  const [regenError, setRegenError] = useState<string | null>(null)
  const [regenCodes, setRegenCodes] = useState<string[]>([])

  const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]'

  const beginMutation = useMutation({
    mutationFn: () => twoFactorApi.enrollBegin(),
    onSuccess: (data) => { setEnrollData(data); setConfirmCode(''); setConfirmError(null); setEnrollStep('qr') },
    onError: (err) => { toast(err instanceof ApiError ? err.message : 'Failed to start enrollment', 'error') },
  })

  const confirmMutation = useMutation({
    mutationFn: (code: string) => twoFactorApi.enrollConfirm(code),
    onSuccess: (data) => {
      setNewBackupCodes(data.backup_codes)
      setSavedAck(false)
      setEnrollStep('codes')
      updateUser({ totp_enabled: true })
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (err) => { setConfirmError(err instanceof ApiError ? err.message || 'Invalid code' : 'Failed to verify code') },
  })

  const disableMutation = useMutation({
    mutationFn: (input: { password?: string; code?: string }) => twoFactorApi.disable(input),
    onSuccess: () => {
      toast('Two-factor authentication disabled', 'success')
      setDisableFormOpen(false); setDisableSecret(''); setDisableError(null)
      updateUser({ totp_enabled: false })
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (err) => { setDisableError(err instanceof ApiError ? err.message || 'Could not disable 2FA' : 'Could not disable 2FA') },
  })

  const regenMutation = useMutation({
    mutationFn: (code: string) => twoFactorApi.regenerateBackupCodes(code),
    onSuccess: (data) => { setRegenCodes(data.backup_codes); setRegenCode(''); setRegenError(null); queryClient.invalidateQueries({ queryKey: ['2fa-status'] }) },
    onError: (err) => { setRegenError(err instanceof ApiError ? err.message || 'Invalid code' : 'Could not regenerate codes') },
  })

  function handleConfirm(e: FormEvent) {
    e.preventDefault()
    if (!confirmCode.trim()) return
    confirmMutation.mutate(confirmCode.trim())
  }

  function handleDisable(e: FormEvent) {
    e.preventDefault()
    setDisableError(null)
    if (!disableSecret.trim()) { setDisableError(disableMode === 'password' ? 'Password is required' : 'Code is required'); return }
    disableMutation.mutate(disableMode === 'password' ? { password: disableSecret } : { code: disableSecret.trim() })
  }

  function handleRegenSubmit(e: FormEvent) {
    e.preventDefault()
    if (!regenCode.trim()) return
    regenMutation.mutate(regenCode.trim())
  }

  function copyCodes(codes: string[]) {
    navigator.clipboard.writeText(codes.join('\n'))
      .then(() => toast('Backup codes copied to clipboard', 'success'))
      .catch(() => toast('Could not copy to clipboard', 'error'))
  }

  function downloadCodes(codes: string[]) {
    const blob = new Blob([`SUB12 backup codes\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sub12-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function finishEnrollment() {
    setEnrollStep('idle'); setEnrollData(null); setConfirmCode(''); setNewBackupCodes([]); setSavedAck(false)
  }

  const toggleModeCls = (active: boolean) =>
    `px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors ${active ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5' : 'border-subtle text-muted hover:text-secondary'}`

  return (
    <div className="space-y-5">
      <div className="lc-section">
        <div className="lc-section-head">
          <span className="lc-section-title"><ShieldCheck size={12} /> Two-factor authentication</span>
        </div>
        <div className="p-5 space-y-4">
          {isLoading && <p className="text-xs text-muted">Loading…</p>}

          {!isLoading && status && !status.enabled && enrollStep === 'idle' && (
            <>
              <p className="text-sm text-muted">Add a second step at sign-in using an authenticator app like Google Authenticator, Authy, or 1Password. We strongly recommend it.</p>
              <button onClick={() => beginMutation.mutate()} disabled={beginMutation.isPending} className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50">
                {beginMutation.isPending ? 'Starting…' : 'Enable 2FA'}
              </button>
            </>
          )}

          {!isLoading && status && status.enabled && enrollStep === 'idle' && (
            <>
              <p className="text-sm text-secondary">
                <span className="text-[var(--brass)]">●</span> Two-factor authentication is <strong>enabled</strong>.
              </p>
              {status.enrolled_at && <p className="text-xs text-muted">Set up on {new Date(status.enrolled_at).toLocaleDateString()}.</p>}
              <p className="text-xs text-muted">{status.backup_codes_remaining} unused backup code{status.backup_codes_remaining === 1 ? '' : 's'} remaining.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => { setRegenOpen(true); setRegenCode(''); setRegenError(null); setRegenCodes([]) }} className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors">
                  <KeyRound size={12} className="inline mr-1" /> Regenerate backup codes
                </button>
                <button onClick={() => { setDisableWarnOpen(true); setDisableSecret(''); setDisableError(null); setDisableMode('password') }} className="px-3 py-1.5 rounded border border-[var(--error-text)]/30 text-[11px] tracking-widest uppercase text-[var(--error-text)] hover:bg-[var(--error-bg)] transition-colors">
                  <ShieldOff size={12} className="inline mr-1" /> Disable 2FA
                </button>
              </div>
            </>
          )}

          {enrollStep === 'qr' && enrollData && (
            <div className="space-y-4">
              <p className="text-sm text-muted">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
              <div className="flex justify-center bg-white p-4 rounded">
                <QRCodeSVG value={enrollData.otpauth_uri} size={192} level="M" />
              </div>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer hover:text-secondary">Can't scan? Enter the secret manually</summary>
                <pre className="mt-2 bg-page border border-subtle rounded p-2 font-mono text-[11px] text-secondary break-all whitespace-pre-wrap">{enrollData.secret}</pre>
              </details>
              <form onSubmit={handleConfirm} className="space-y-2">
                <label className="text-xs tracking-wide text-muted" htmlFor="enroll-code">Verification code</label>
                <input id="enroll-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} placeholder="••••••" className={`${inputCls} text-center tracking-[0.4em] font-mono`} />
                {confirmError && <p className="text-xs text-[var(--error-text)]">{confirmError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={confirmMutation.isPending || confirmCode.length === 0} className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50">
                    {confirmMutation.isPending ? 'Verifying…' : 'Verify and enable'}
                  </button>
                  <button type="button" onClick={finishEnrollment} className="px-4 py-2 rounded border border-subtle t-section-title">Cancel</button>
                </div>
              </form>
            </div>
          )}

          {enrollStep === 'codes' && newBackupCodes.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-secondary"><strong>2FA is now enabled.</strong> Save these backup codes somewhere safe — each works once and they will <strong>not be shown again</strong>.</p>
              <pre className="bg-page border border-subtle rounded p-3 font-mono text-sm text-secondary grid grid-cols-2 gap-x-6 gap-y-1">
                {newBackupCodes.map((c) => <span key={c}>{c}</span>)}
              </pre>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => copyCodes(newBackupCodes)} className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors">
                  <Copy size={12} className="inline mr-1" /> Copy
                </button>
                <button onClick={() => downloadCodes(newBackupCodes)} className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors">
                  <Download size={12} className="inline mr-1" /> Download .txt
                </button>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={savedAck} onChange={(e) => setSavedAck(e.target.checked)} className="mt-1" />
                <span className="text-xs text-secondary">I have saved these backup codes in a safe place.</span>
              </label>
              <button onClick={finishEnrollment} disabled={!savedAck} className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50 disabled:cursor-not-allowed">Done</button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={disableWarnOpen}
        title="Disable two-factor authentication?"
        message="Your account will only be protected by your password. You can re-enable 2FA at any time."
        confirmLabel="Continue"
        onConfirm={() => { setDisableWarnOpen(false); setDisableFormOpen(true) }}
        onCancel={() => setDisableWarnOpen(false)}
      />

      {disableFormOpen && (
        <div className="lc-section">
          <div className="lc-section-head">
            <span className="lc-section-title">Confirm to disable 2FA</span>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex gap-2 text-[11px] tracking-widest uppercase">
              <button type="button" onClick={() => { setDisableMode('password'); setDisableSecret(''); setDisableError(null) }} aria-pressed={disableMode === 'password'} className={toggleModeCls(disableMode === 'password')}>Password</button>
              <button type="button" onClick={() => { setDisableMode('code'); setDisableSecret(''); setDisableError(null) }} aria-pressed={disableMode === 'code'} className={toggleModeCls(disableMode === 'code')}>Current 2FA code</button>
            </div>
            <form onSubmit={handleDisable} className="space-y-2">
              <input type={disableMode === 'password' ? 'password' : 'text'} autoComplete={disableMode === 'password' ? 'current-password' : 'one-time-code'} inputMode={disableMode === 'code' ? 'numeric' : undefined} maxLength={disableMode === 'code' ? 16 : undefined} value={disableSecret} onChange={(e) => setDisableSecret(e.target.value)} placeholder={disableMode === 'password' ? 'Your password' : '6-digit or backup code'} className={inputCls} />
              {disableError && <p className="text-xs text-[var(--error-text)]">{disableError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={disableMutation.isPending || !disableSecret.trim()} className="px-3 py-1.5 rounded bg-[var(--error-text)] text-white text-[11px] tracking-widests uppercase font-medium disabled:opacity-50">
                  {disableMutation.isPending ? 'Disabling…' : 'Disable 2FA'}
                </button>
                <button type="button" onClick={() => { setDisableFormOpen(false); setDisableSecret(''); setDisableError(null) }} className="px-3 py-1.5 rounded border border-subtle t-section-title">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {regenOpen && (
        <div className="lc-section">
          <div className="lc-section-head">
            <span className="lc-section-title">Regenerate backup codes</span>
          </div>
          <div className="p-5 space-y-3">
            {regenCodes.length === 0 ? (
              <>
                <p className="text-sm text-muted">Existing backup codes will be invalidated. Enter your current 6-digit authenticator code to continue.</p>
                <form onSubmit={handleRegenSubmit} className="space-y-2">
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={regenCode} onChange={(e) => setRegenCode(e.target.value)} placeholder="••••••" className={`${inputCls} text-center tracking-[0.4em] font-mono`} />
                  {regenError && <p className="text-xs text-[var(--error-text)]">{regenError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={regenMutation.isPending || !regenCode.trim()} className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50">
                      {regenMutation.isPending ? 'Regenerating…' : 'Regenerate'}
                    </button>
                    <button type="button" onClick={() => { setRegenOpen(false); setRegenCode(''); setRegenError(null); setRegenCodes([]) }} className="px-4 py-2 rounded border border-subtle t-section-title">Cancel</button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-secondary"><strong>New backup codes generated.</strong> Save these somewhere safe — old codes are now invalid.</p>
                <pre className="bg-page border border-subtle rounded p-3 font-mono text-sm text-secondary grid grid-cols-2 gap-x-6 gap-y-1">
                  {regenCodes.map((c) => <span key={c}>{c}</span>)}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => copyCodes(regenCodes)} className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors">
                    <Copy size={12} className="inline mr-1" /> Copy
                  </button>
                  <button onClick={() => downloadCodes(regenCodes)} className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors">
                    <Download size={12} className="inline mr-1" /> Download .txt
                  </button>
                </div>
                <button onClick={() => { setRegenOpen(false); setRegenCodes([]) }} className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium">Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Social ───────────────────────────────────────────────────────────────

type SocialTab = 'following' | 'followers'
const SOCIAL_PAGE_SIZE = 50

function SocialTabContent() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<SocialTab>('following')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [confirmSingle, setConfirmSingle] = useState<FollowListItem | null>(null)

  const userId = user?.id

  const { data: followingData, isLoading: followingLoading } = useQuery({
    queryKey: ['follow-management', 'following', userId],
    queryFn: () => usersApi.getFollowing(userId!, SOCIAL_PAGE_SIZE, 0),
    enabled: !!userId,
  })

  const { data: followersData, isLoading: followersLoading } = useQuery({
    queryKey: ['follow-management', 'followers', userId],
    queryFn: () => usersApi.getFollowers(userId!, SOCIAL_PAGE_SIZE, 0),
    enabled: !!userId,
  })

  const { data: requestsData } = useQuery({ queryKey: ['follow-requests'], queryFn: () => usersApi.listFollowRequests() })

  const following = useMemo(() => followingData?.items ?? [], [followingData])
  const followers = useMemo(() => followersData?.items ?? [], [followersData])
  const requests = requestsData?.items ?? []

  function invalidateLists() {
    queryClient.invalidateQueries({ queryKey: ['follow-management'] })
    queryClient.invalidateQueries({ queryKey: ['following', userId] })
    queryClient.invalidateQueries({ queryKey: ['followers', userId] })
    queryClient.invalidateQueries({ queryKey: ['user-profile', userId] })
    queryClient.invalidateQueries({ queryKey: ['follow-requests'] })
  }

  const unfollowMutation = useMutation({
    mutationFn: (id: string) => usersApi.unfollow(id),
    onSuccess: (_, id) => {
      const removed = following.find((u) => u.user_id === id)
      toast(removed ? `Unfollowed ${removed.display_name}` : 'Unfollowed', 'success')
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next })
      invalidateLists()
    },
    onError: () => toast('Failed to unfollow', 'error'),
  })

  const bulkUnfollowMutation = useMutation({
    mutationFn: (ids: string[]) => usersApi.bulkUnfollow(ids),
    onSuccess: ({ unfollowed }) => {
      toast(unfollowed === 1 ? 'Unfollowed 1 user' : `Unfollowed ${unfollowed} users`, 'success')
      setSelected(new Set())
      invalidateLists()
    },
    onError: () => toast('Failed to unfollow users', 'error'),
  })

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accepted' | 'rejected' }) => usersApi.decideFollowRequest(id, decision),
    onSuccess: () => invalidateLists(),
  })

  const activeItems = tab === 'following' ? following : followers
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return activeItems
    return activeItems.filter((item) => item.display_name.toLowerCase().includes(q))
  }, [activeItems, query])

  const selectedItems = useMemo(() => following.filter((u) => selected.has(u.user_id)), [following, selected])
  const allVisibleSelected = tab === 'following' && filtered.length > 0 && filtered.every((u) => selected.has(u.user_id))

  function toggleSelected(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  function toggleSelectAllVisible() {
    if (tab !== 'following') return
    setSelected((prev) => {
      if (allVisibleSelected) { const next = new Set(prev); filtered.forEach((u) => next.delete(u.user_id)); return next }
      const next = new Set(prev); filtered.forEach((u) => next.add(u.user_id)); return next
    })
  }

  function switchTab(next: SocialTab) { setTab(next); setQuery(''); setSelected(new Set()) }

  const isLoading = tab === 'following' ? followingLoading : followersLoading
  const pageLimitHit = activeItems.length >= SOCIAL_PAGE_SIZE

  return (
    <div className="space-y-5">
      {requests.length > 0 && (
        <div className="lc-section">
          <div className="lc-section-head">
            <span className="lc-section-title"><UserCheck size={12} /> Follow requests <span className="lc-tab-pill">{requests.length}</span></span>
          </div>
          <div className="p-5 space-y-2">
            {requests.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-surface border border-subtle rounded-lg">
                <div className="flex items-center gap-3">
                  <UserAvatar user={{ id: req.requester_id, display_name: req.display_name, avatar_url: req.avatar_url }} size={32} variant="plain" />
                  <span className="text-sm text-secondary">{req.display_name}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => decideMutation.mutate({ id: req.id, decision: 'accepted' })} disabled={decideMutation.isPending} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[10px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <UserCheck size={11} /> Accept
                  </button>
                  <button onClick={() => decideMutation.mutate({ id: req.id, decision: 'rejected' })} disabled={decideMutation.isPending} className="flex items-center gap-1 px-2 py-1 rounded border border-subtle text-[10px] tracking-widest uppercase text-muted hover:text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <UserX size={11} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="lc-section">
        <div className="lc-tabs" role="tablist">
          {([
            { id: 'following' as SocialTab, label: `Following${following.length ? ` (${following.length})` : ''}` },
            { id: 'followers' as SocialTab, label: `Followers${followers.length ? ` (${followers.length})` : ''}` },
          ]).map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`lc-tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => switchTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${tab}…`}
              className="w-full bg-surface border border-subtle rounded pl-9 pr-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 placeholder-muted"
            />
          </div>

          {tab === 'following' && filtered.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <button onClick={toggleSelectAllVisible} className="flex items-center gap-2 t-section-title hover:text-secondary transition-colors">
                {allVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {allVisibleSelected ? 'Deselect all' : 'Select all'}
              </button>
              <button
                onClick={() => setConfirmBulk(true)}
                disabled={selected.size === 0 || bulkUnfollowMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserMinus size={12} />
                Unfollow{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
            </div>
          )}

          {isLoading ? (
            <SkeletonList count={4} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted text-center py-8 tracking-wide">
              {query ? 'No matches.' : tab === 'following' ? 'Not following anyone yet.' : 'No followers yet.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((item) => {
                const isSelected = selected.has(item.user_id)
                return (
                  <li key={item.user_id} className="flex items-center gap-3 p-3 bg-surface border border-subtle rounded-lg">
                    {tab === 'following' && (
                      <button onClick={() => toggleSelected(item.user_id)} className="text-muted hover:text-[var(--brass)] transition-colors" aria-label={isSelected ? 'Deselect' : 'Select'} aria-pressed={isSelected}>
                        {isSelected ? <CheckSquare size={18} className="text-[var(--brass)]" /> : <Square size={18} />}
                      </button>
                    )}
                    <Link to="/users/$id" params={{ id: item.user_id }} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                      <img
                        src={item.avatar_url || identiconDataUri(item.user_id || item.display_name || '')}
                        alt={item.display_name}
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      />
                      <span className="text-sm text-secondary truncate">{item.display_name}</span>
                    </Link>
                    {tab === 'following' && (
                      <button onClick={() => setConfirmSingle(item)} disabled={unfollowMutation.isPending} className="flex items-center gap-1 px-2.5 py-1 rounded border border-subtle text-[10px] tracking-widest uppercase text-muted hover:text-secondary hover:border-[var(--brass)]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <UserMinus size={11} /> Unfollow
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {pageLimitHit && (
            <p className="text-[11px] text-muted text-center">Showing the {SOCIAL_PAGE_SIZE} most recent. Use search to narrow down.</p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmSingle}
        title="Unfollow user?"
        message={confirmSingle ? `Are you sure you want to unfollow ${confirmSingle.display_name}?` : ''}
        confirmLabel="Unfollow"
        onConfirm={() => { if (confirmSingle) unfollowMutation.mutate(confirmSingle.user_id); setConfirmSingle(null) }}
        onCancel={() => setConfirmSingle(null)}
      />

      <ConfirmDialog
        open={confirmBulk}
        title={`Unfollow ${selected.size} ${selected.size === 1 ? 'user' : 'users'}?`}
        message={
          selectedItems.length <= 5
            ? `This will unfollow: ${selectedItems.map((u) => u.display_name).join(', ')}.`
            : `This will unfollow ${selected.size} users, including ${selectedItems.slice(0, 3).map((u) => u.display_name).join(', ')}, and ${selected.size - 3} more.`
        }
        confirmLabel="Unfollow all"
        onConfirm={() => { bulkUnfollowMutation.mutate(Array.from(selected)); setConfirmBulk(false) }}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  )
}

// ─── Main Profile component ────────────────────────────────────────────────────

export default function Profile() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { tab?: ProfileTab }
  const activeTab: ProfileTab = search.tab ?? 'overview'

  function setTab(tab: ProfileTab) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: '/profile' as any, search: { tab } as any, replace: true })
  }

  return (
    <PageGrid>
      <PageHeader
        title="Profile"
        info={<HelpIcon content={pageHelp.profile} />}
        description="Manage your identity, preferences, privacy and security."
      />

      {/* Identity banner — always visible */}
      <div className="lc-section">
        <div className="p-5">
          <div className="flex items-center gap-4">
            <UserAvatar user={user ?? {}} size={64} showHoverCard={false} className="border-2 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-base font-semibold text-primary leading-tight">{user?.display_name ?? '—'}</p>
              {user?.bio && <p className="text-sm text-secondary leading-relaxed line-clamp-2">{user.bio}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {user?.location && (
                  <span className="flex items-center gap-1 text-[11px] text-muted">
                    <MapPin size={11} /> {user.location}
                  </span>
                )}
                {user?.club && (
                  <span className="flex items-center gap-1 text-[11px] text-muted">
                    <Users size={11} /> {user.club}
                  </span>
                )}
                {user?.profile_visibility === 'private' && (
                  <span className="flex items-center gap-1 text-[11px] text-muted">
                    <Lock size={11} /> Private
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setTab('edit')}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary hover:border-[var(--brass)]/40 transition-colors"
            >
              <Pencil size={12} /> Edit
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar + content */}
      <div className="lc-section">
        <div className="lc-tabs overflow-x-auto" role="tablist" style={{ scrollbarWidth: 'none' }}>
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={activeTab === t.key}
                className={`lc-tab shrink-0 ${activeTab === t.key ? 'is-active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <Icon size={13} />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="p-5">
          {activeTab === 'overview'      && <OverviewTab />}
          {activeTab === 'edit'          && <EditTab />}
          {activeTab === 'privacy'       && <PrivacyTab />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'security'      && <SecurityTab />}
          {activeTab === 'social'        && <SocialTabContent />}
        </div>
      </div>
    </PageGrid>
  )
}
