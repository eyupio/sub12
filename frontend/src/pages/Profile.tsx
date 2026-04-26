import { useState, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, X, Check, MapPin, Users, Camera, Mail, Lock, Globe, UserCheck, UserX, Ruler, CalendarDays } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { statsApi } from '../api/stats'
import { scoreCardApi } from '../api/scoreCards'
import { usersApi, UpdateProfileInput } from '../api/users'
import { achievementApi } from '../api/achievements'
import { gearApi } from '../api/gear'
import { RifleProfileCard } from '../components/RifleProfileCard'
import { AchievementsSection } from '../components/AchievementsSection'
import { StarBadge } from '../components/StarBadge'
import { UserAvatar } from '../components/UserAvatar'
import { toast } from '../store/toast'
import { DATE_FORMAT_OPTIONS, DEFAULT_PREFS, formatDate, type DateFormat, type TimeFormat } from '../utils/date'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

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

  const avatarMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: (updated) => {
      updateUser({ avatar_url: updated.avatar_url })
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast('Image must be under 5 MB', 'error')
        return
      }
      avatarMutation.mutate(file)
    }
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
        disabled={avatarMutation.isPending}
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
    </div>
  )
}

function FollowRequestsSection() {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['follow-requests'],
    queryFn: () => usersApi.listFollowRequests(),
  })

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accepted' | 'rejected' }) =>
      usersApi.decideFollowRequest(id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-requests'] })
    },
  })

  const requests = data?.items ?? []
  if (requests.length === 0) return null

  return (
    <div>
      <h2 className="text-[11px] tracking-widest uppercase text-muted mb-3">Follow Requests</h2>
      <div className="space-y-2">
        {requests.map((req) => (
          <div key={req.id} className="flex items-center justify-between p-3 bg-surface border border-subtle rounded-lg">
            <div className="flex items-center gap-3">
              <UserAvatar
                user={{ id: req.requester_id, display_name: req.display_name, avatar_url: req.avatar_url }}
                size={32}
                variant="plain"
              />
              <span className="text-sm text-secondary">{req.display_name}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => decideMutation.mutate({ id: req.id, decision: 'accepted' })}
                disabled={decideMutation.isPending}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[10px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserCheck size={11} />
                Accept
              </button>
              <button
                onClick={() => decideMutation.mutate({ id: req.id, decision: 'rejected' })}
                disabled={decideMutation.isPending}
                className="flex items-center gap-1 px-2 py-1 rounded border border-subtle text-[10px] tracking-widest uppercase text-muted hover:text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserX size={11} />
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PrivacySettings() {
  const { user, updateUser } = useAuthStore()

  const mutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      updateUser({
        profile_visibility: updated.profile_visibility,
        default_score_visibility: updated.default_score_visibility,
        feed_opt_out: updated.feed_opt_out,
      })
      toast('Privacy settings saved', 'success')
    },
    onError: () => {
      toast('Failed to save privacy settings', 'error')
    },
  })

  const visOptions = [
    { value: 'public', label: 'Public', icon: Globe },
    { value: 'followers', label: 'Followers', icon: UserCheck },
    { value: 'private', label: 'Private', icon: Lock },
  ]

  const isPrivateProfile = user?.profile_visibility === 'private'

  return (
    <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-6 space-y-4">
      <h2 className="text-[11px] tracking-widest uppercase text-muted">Privacy & Feed</h2>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Private profile</p>
            <p className="text-[10px] text-muted mt-0.5">
              Only your followers can see your bio, location, club, and achievements.
              New followers will need to request access.
            </p>
          </div>
          <button
            onClick={() =>
              mutation.mutate({
                profile_visibility: isPrivateProfile ? 'public' : 'private',
              })
            }
            disabled={mutation.isPending}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              isPrivateProfile
                ? 'bg-[var(--brass)]'
                : 'bg-[var(--surface-hover)]'
            }`}
            aria-label="Toggle private profile"
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                isPrivateProfile ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div>
          <label className="block text-[10px] tracking-widest uppercase text-muted mb-2">
            Default Score Visibility
          </label>
          <div className="flex gap-2">
            {visOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => mutation.mutate({ default_score_visibility: value })}
                disabled={mutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  (user?.default_score_visibility ?? 'public') === value
                    ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                    : 'border-subtle text-muted hover:text-secondary'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-1">
            New score cards will default to this visibility.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Hide from Public feed</p>
            <p className="text-[10px] text-muted mt-0.5">
              Your activity won't appear in the global Public feed.
            </p>
          </div>
          <button
            onClick={() => mutation.mutate({ feed_opt_out: !user?.feed_opt_out })}
            disabled={mutation.isPending}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              user?.feed_opt_out
                ? 'bg-[var(--brass)]'
                : 'bg-[var(--surface-hover)]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                user?.feed_opt_out ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  )
}

function UnitPreferences() {
  const { user, updateUser } = useAuthStore()

  const mutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      updateUser({
        default_distance_unit: updated.default_distance_unit,
        default_measurement_unit: updated.default_measurement_unit,
      })
      toast('Unit preferences saved', 'success')
    },
    onError: () => {
      toast('Failed to save unit preferences', 'error')
    },
  })

  const distanceOptions = [
    { value: 'meters', label: 'Meters' },
    { value: 'yards', label: 'Yards' },
  ]

  const measurementOptions = [
    { value: 'cm', label: 'cm' },
    { value: 'mm', label: 'mm' },
  ]

  return (
    <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Ruler size={14} className="text-muted" />
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Unit Preferences</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-muted mb-2">
            Default Distance Unit
          </label>
          <div className="flex gap-2">
            {distanceOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => mutation.mutate({ default_distance_unit: value })}
                disabled={mutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  (user?.default_distance_unit ?? 'meters') === value
                    ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                    : 'border-subtle text-muted hover:text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-1">
            Used as the default when creating pellet tests and measurements.
          </p>
        </div>

        <div>
          <label className="block text-[10px] tracking-widest uppercase text-muted mb-2">
            Default Measurement Unit
          </label>
          <div className="flex gap-2">
            {measurementOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => mutation.mutate({ default_measurement_unit: value })}
                disabled={mutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  (user?.default_measurement_unit ?? 'cm') === value
                    ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                    : 'border-subtle text-muted hover:text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-1">
            Used for calibration distance in the measurement wizard.
          </p>
        </div>
      </div>
    </div>
  )
}

function RegionalPreferences() {
  const { user, updateUser } = useAuthStore()

  const mutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      updateUser({
        date_format: updated.date_format,
        time_format: updated.time_format,
        timezone: updated.timezone,
      })
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

  return (
    <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays size={14} className="text-muted" />
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Regional Preferences</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[10px] tracking-widest uppercase text-muted mb-2">
            Date Format
          </label>
          <div className="flex flex-wrap gap-2">
            {DATE_FORMAT_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => mutation.mutate({ date_format: value })}
                disabled={mutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  currentDateFormat === value
                    ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                    : 'border-subtle text-muted hover:text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-1">
            Preview: {formatDate(new Date(), { dateFormat: currentDateFormat, timeFormat: currentTimeFormat, timezone: currentTimezone })}
          </p>
        </div>

        <div>
          <label className="block text-[10px] tracking-widest uppercase text-muted mb-2">
            Time Format
          </label>
          <div className="flex gap-2">
            {(['24h', '12h'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => mutation.mutate({ time_format: v })}
                disabled={mutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  currentTimeFormat === v
                    ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                    : 'border-subtle text-muted hover:text-secondary'
                }`}
              >
                {v === '24h' ? '24-hour' : '12-hour'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="timezone-select" className="block text-[10px] tracking-widest uppercase text-muted mb-2">
            Timezone
          </label>
          <select
            id="timezone-select"
            value={currentTimezone}
            onChange={(e) => mutation.mutate({ timezone: e.target.value })}
            disabled={mutation.isPending}
            className="w-full max-w-xs px-3 py-1.5 rounded border border-subtle bg-surface text-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!timezones.includes(currentTimezone) && (
              <option value={currentTimezone}>{currentTimezone}</option>
            )}
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-muted mt-1">
            Dates and times in the app are displayed in this timezone.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Profile() {
  const { user, updateUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<UpdateProfileInput>({})
  const [error, setError] = useState<string | null>(null)
  const [emailEditing, setEmailEditing] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.getMe(),
  })

  const { data: history } = useQuery({
    queryKey: ['score-cards'],
    queryFn: () => scoreCardApi.list(5, 0),
  })

  const { data: achievementsData } = useQuery({
    queryKey: ['achievements', 'me'],
    queryFn: () => achievementApi.listMine(),
    enabled: !!user,
  })

  const { data: achievementDefsData } = useQuery({
    queryKey: ['achievement-defs'],
    queryFn: () => achievementApi.listDefs(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: riflesData } = useQuery({
    queryKey: ['rifles'],
    queryFn: () => gearApi.listRifles(),
  })

  const { data: rifleStatsData } = useQuery({
    queryKey: ['rifle-stats'],
    queryFn: () => statsApi.getRifleStats(),
  })

  const rifles = riflesData?.items ?? []
  const rifleStatsMap = new Map(
    (rifleStatsData?.items ?? []).map(rs => [rs.rifle_id, rs])
  )

  const mutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      updateUser({
        display_name: updated.display_name,
        bio: updated.bio,
        location: updated.location,
        club: updated.club,
        avatar_url: updated.avatar_url,
        profile_visibility: updated.profile_visibility,
        default_score_visibility: updated.default_score_visibility,
        feed_opt_out: updated.feed_opt_out,
        default_distance_unit: updated.default_distance_unit,
        default_measurement_unit: updated.default_measurement_unit,
      })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setEditing(false)
      setError(null)
    },
    onError: () => {
      setError('Failed to save changes. Please try again.')
    },
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
      const msg = err instanceof Error ? err.message : 'Failed to request email change'
      setEmailError(msg)
      setEmailMsg(null)
    },
  })

  function startEdit() {
    setForm({
      display_name: user?.display_name ?? '',
      bio: user?.bio ?? '',
      location: user?.location ?? '',
      club: user?.club ?? '',
      profile_visibility: user?.profile_visibility ?? 'public',
    })
    setError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setError(null)
  }

  function handleSave() {
    const input: UpdateProfileInput = {}
    if (form.display_name !== undefined) input.display_name = form.display_name || undefined
    if (form.bio !== undefined) input.bio = form.bio || undefined
    if (form.location !== undefined) input.location = form.location || undefined
    if (form.club !== undefined) input.club = form.club || undefined
    if (form.profile_visibility !== undefined) input.profile_visibility = form.profile_visibility
    mutation.mutate(input)
  }

  const recentCards = history?.items ?? []
  const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 placeholder-muted'

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Profile</h1>
          <HelpIcon content={pageHelp.profile} />
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
          >
            <Pencil size={13} />
            Edit
          </button>
        )}
      </div>

      {/* Identity card */}
      <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-6 space-y-4">
        <div className="flex items-start gap-4">
          <AvatarUpload />
          <div className="flex-1 min-w-0 space-y-2">
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={form.display_name ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                    className={inputCls}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
                    Bio
                  </label>
                  <textarea
                    value={form.bio ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    rows={2}
                    className={`${inputCls} resize-none`}
                    placeholder="A few words about you"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={form.location ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. Yorkshire"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
                      Club
                    </label>
                    <input
                      type="text"
                      value={form.club ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, club: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. YHFTA"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
                    Profile Visibility
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, profile_visibility: 'public' }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors ${
                        (form.profile_visibility ?? user?.profile_visibility ?? 'public') === 'public'
                          ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                          : 'border-subtle text-muted hover:text-secondary'
                      }`}
                    >
                      <Globe size={12} />
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, profile_visibility: 'private' }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors ${
                        (form.profile_visibility ?? user?.profile_visibility ?? 'public') === 'private'
                          ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                          : 'border-subtle text-muted hover:text-secondary'
                      }`}
                    >
                      <Lock size={12} />
                      Private
                    </button>
                  </div>
                  <p className="text-[10px] text-muted mt-1">
                    {(form.profile_visibility ?? user?.profile_visibility ?? 'public') === 'private'
                      ? 'Only your followers can see your full profile and activity.'
                      : 'Anyone can see your full profile and activity.'}
                  </p>
                </div>

                {error && <p className="text-[var(--error-text)] text-xs">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={mutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check size={13} />
                    {mutation.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={mutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <X size={13} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-lg font-medium text-primary">{user?.display_name}</p>
                {user?.bio && <p className="text-sm text-secondary leading-relaxed">{user.bio}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {user?.location && (
                    <span className="flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
                      <MapPin size={12} />
                      {user.location}
                    </span>
                  )}
                  {user?.club && (
                    <span className="flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
                      <Users size={12} />
                      {user.club}
                    </span>
                  )}
                </div>
                {!user?.bio && !user?.location && !user?.club && (
                  <p className="text-[11px] text-muted tracking-wide">No bio yet — tap Edit to add one.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Email */}
      <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-muted" />
            <p className="text-[10px] tracking-widest uppercase text-muted">Email</p>
          </div>
          {!emailEditing && (
            <button
              onClick={() => { setEmailEditing(true); setNewEmail(''); setEmailMsg(null); setEmailError(null) }}
              className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
            >
              Change
            </button>
          )}
        </div>
        <p className="text-sm text-secondary">{user?.email}</p>
        {emailEditing && (
          <div className="space-y-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email address"
              className={inputCls}
            />
            <div className="flex gap-2">
              <button
                onClick={() => emailChangeMutation.mutate(newEmail)}
                disabled={emailChangeMutation.isPending || !newEmail.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={13} />
                {emailChangeMutation.isPending ? 'Sending…' : 'Send Confirmation'}
              </button>
              <button
                onClick={() => { setEmailEditing(false); setEmailError(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
              >
                <X size={13} />
                Cancel
              </button>
            </div>
          </div>
        )}
        {emailMsg && <p className="text-xs text-[var(--brass)]">{emailMsg}</p>}
        {emailError && <p className="text-xs text-[var(--error-text)]">{emailError}</p>}
      </div>

      {/* Privacy & Feed */}
      <PrivacySettings />

      <div className="flex flex-wrap gap-2 text-[11px] tracking-widest uppercase">
        <Link to="/settings/privacy" className="text-[var(--brass)] hover:opacity-80">
          → Advanced privacy settings
        </Link>
        <span className="text-muted">·</span>
        <Link to="/settings/notifications" className="text-[var(--brass)] hover:opacity-80">
          → Notification preferences
        </Link>
        <span className="text-muted">·</span>
        <Link to="/settings/security" className="text-[var(--brass)] hover:opacity-80">
          → Security &amp; 2FA
        </Link>
        <span className="text-muted">·</span>
        <Link to="/profile/follows" className="text-[var(--brass)] hover:opacity-80">
          → Manage follows
        </Link>
      </div>

      {/* Unit Preferences */}
      <UnitPreferences />

      {/* Regional Preferences */}
      <RegionalPreferences />

      {/* Stats */}
      <div>
        <h2 className="text-[11px] tracking-widest uppercase text-muted mb-3">Stats</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <StatCard
            label="Best Score"
            value={stats?.best_score != null ? String(stats.best_score) : '—'}
            gold
            to={stats?.best_score_card_id ? '/scores/$id' : undefined}
            params={stats?.best_score_card_id ? { id: stats.best_score_card_id } : undefined}
          />
          <StatCard
            label="Best X Count"
            value={stats?.best_x_count != null ? String(stats.best_x_count) : '—'}
            gold
          />
          <StatCard label="Cards Logged" value={stats ? String(stats.cards_logged) : '—'} />
          <StatCard
            label="Avg Score"
            value={stats?.avg_score != null ? stats.avg_score.toFixed(1) : '—'}
          />
        </div>
      </div>

      {/* My Rifles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">My Rifles</h2>
          <Link
            to="/gear"
            className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
          >
            Manage gear →
          </Link>
        </div>
        {rifles.length === 0 ? (
          <p className="text-sm text-muted tracking-wide">No rifles added yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rifles.map(r => (
              <RifleProfileCard
                key={r.id}
                rifle={r}
                stats={rifleStatsMap.get(r.id)}
                mode="profile"
              />
            ))}
          </div>
        )}
      </div>

      {/* Achievements */}
      <AchievementsSection
        earned={achievementsData?.items ?? []}
        allDefs={achievementDefsData?.items ?? []}
      />

      {/* Follow Requests (only for private profiles) */}
      {(user?.profile_visibility === 'private') && <FollowRequestsSection />}

      {/* Recent cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Recent Cards</h2>
          {recentCards.length > 0 && (
            <Link
              to="/scores"
              className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
            >
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
                  {card.location && (
                    <p className="text-[11px] text-muted">{card.location}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-lg font-semibold text-primary">{card.total_score}</span>
                  {card.x_count > 0 && (
                    <span className="text-xs text-[var(--brass)]">{card.x_count}X</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
