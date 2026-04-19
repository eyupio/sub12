import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Camera, Shield, ShieldOff, Trash2, LogOut, Check, X as XIcon, RefreshCw } from 'lucide-react'
import { clubsApi, type Club, type ClubMember } from '../api/clubs'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DATE_FORMAT_OPTIONS, DEFAULT_PREFS, formatDate, useRegionalPrefs, type DateFormat, type TimeFormat } from '../utils/date'

const TIMEZONES: string[] = (() => {
  const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  if (typeof fn === 'function') return fn('timeZone')
  return ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']
})()

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 'text-[11px] tracking-widest uppercase text-muted'
const sectionCls = 'border border-subtle rounded bg-surface p-4 space-y-4'
const btnPrimary = 'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'

// ---------------------------------------------------------------------------
// Club Image Section
// ---------------------------------------------------------------------------

function ClubImageSection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: (file: File) => clubsApi.uploadImage(clubId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
    },
  })

  return (
    <div className={sectionCls}>
      <h2 className="text-[11px] tracking-widest uppercase text-muted">Club Image</h2>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              toast('Image must be under 5 MB', 'error')
            } else {
              mutation.mutate(file)
            }
          }
          e.target.value = ''
        }}
      />
      <div className="flex items-center gap-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={mutation.isPending}
          className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-subtle hover:border-[var(--brass)]/50 transition-colors disabled:opacity-50"
          aria-label="Upload club image"
        >
          {club.image_url ? (
            <img src={club.image_url} alt={club.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-surface-hover flex items-center justify-center">
              <Camera size={20} className="text-muted" />
            </div>
          )}
        </button>
        <div className="flex-1">
          <p className="text-sm text-secondary">
            {club.image_url ? 'Click to change image' : 'Add a profile picture for this club'}
          </p>
          <p className="text-[11px] text-muted">JPEG, PNG, or WebP. Max 5MB.</p>
          {mutation.isPending && <p className="text-[11px] text-muted mt-1">Uploading...</p>}
          {mutation.isError && <p className="text-[11px] text-[var(--error-text)] mt-1">{mutation.error instanceof Error ? mutation.error.message : 'Upload failed. Please try again.'}</p>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// General Info Section
// ---------------------------------------------------------------------------

function GeneralInfoSection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(club.name)
  const [description, setDescription] = useState(club.description ?? '')

  const mutation = useMutation({
    mutationFn: (input: { name?: string; description?: string }) =>
      clubsApi.update(clubId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Club saved', 'success')
    },
    onError: () => toast('Failed to save', 'error'),
  })

  function handleSave() {
    mutation.mutate({
      name: name.trim() || undefined,
      description: description.trim() || undefined,
    })
  }

  return (
    <div className={sectionCls}>
      <h2 className="text-[11px] tracking-widest uppercase text-muted">General</h2>

      <div className="space-y-1.5">
        <label className={labelCls}>Club Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className={inputCls}
          placeholder="Club name"
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className={inputCls + ' resize-none'}
          rows={3}
          placeholder="A short description of the club"
        />
      </div>

      <button onClick={handleSave} disabled={mutation.isPending || !name.trim()} className={btnPrimary}>
        {mutation.isPending ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Privacy Section
// ---------------------------------------------------------------------------

function PrivacySection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (input: {
      type?: 'public' | 'private'
      join_policy?: 'open' | 'invite_code' | 'approval'
      post_visibility?: 'members' | 'public'
    }) => clubsApi.update(clubId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Privacy updated', 'success')
    },
    onError: () => toast('Failed to update privacy', 'error'),
  })

  const regenMutation = useMutation({
    mutationFn: () => clubsApi.regenerateJoinCode(clubId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast('Join code regenerated', 'success')
    },
    onError: () => toast('Failed to regenerate code', 'error'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="text-[11px] tracking-widest uppercase text-muted">Privacy & Joining</h2>

      <div className="space-y-1.5">
        <label className={labelCls}>Visibility</label>
        <div className="grid grid-cols-2 gap-2">
          {(['public', 'private'] as const).map(value => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ type: value })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-40 ${
                club.type === value
                  ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          {club.type === 'private'
            ? 'Private clubs are hidden from the directory. Only members see content.'
            : 'Public clubs appear in the club directory.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Join Policy</label>
        <div className="grid grid-cols-3 gap-2">
          {(['open', 'invite_code', 'approval'] as const).map(value => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ join_policy: value })}
              className={`px-2 py-2 rounded border text-[10px] tracking-widest uppercase transition-colors disabled:opacity-40 ${
                club.join_policy === value
                  ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {value === 'invite_code' ? 'Code' : value}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          {club.join_policy === 'open' && 'Anyone can join instantly.'}
          {club.join_policy === 'invite_code' && 'Members need the join code to join.'}
          {club.join_policy === 'approval' && 'Admins review and approve each join request.'}
        </p>
      </div>

      {club.join_policy === 'invite_code' && (
        <div className="space-y-1.5">
          <label className={labelCls}>Join Code</label>
          <div className="flex items-center gap-2 bg-surface rounded p-3 border border-subtle">
            <code className="font-mono text-sm text-[var(--brass)] flex-1">{club.join_code || '—'}</code>
            <button
              type="button"
              onClick={() => regenMutation.mutate()}
              disabled={regenMutation.isPending}
              className="text-muted hover:text-secondary transition-colors disabled:opacity-40"
              title="Regenerate code"
              aria-label="Regenerate join code"
            >
              <RefreshCw size={14} className={regenMutation.isPending ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-[10px] text-muted">Regenerating invalidates the previous code.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label className={labelCls}>Post Visibility</label>
        <div className="grid grid-cols-2 gap-2">
          {(['members', 'public'] as const).map(value => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ post_visibility: value })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-40 ${
                club.post_visibility === value
                  ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          {club.post_visibility === 'public'
            ? 'Posts and their activity may appear on the public feed. Members’ own privacy settings still apply.'
            : 'Posts are only visible to club members.'}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Regional Defaults Section
// ---------------------------------------------------------------------------

function RegionalSection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()
  const currentDateFormat = (club.date_format as DateFormat | undefined) ?? DEFAULT_PREFS.dateFormat
  const currentTimeFormat = (club.time_format as TimeFormat | undefined) ?? DEFAULT_PREFS.timeFormat
  const currentTimezone = club.timezone || DEFAULT_PREFS.timezone

  const mutation = useMutation({
    mutationFn: (input: { date_format?: string; time_format?: string; timezone?: string }) =>
      clubsApi.update(clubId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast('Regional defaults saved', 'success')
    },
    onError: () => toast('Failed to save regional defaults', 'error'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="text-[11px] tracking-widest uppercase text-muted">Regional Defaults</h2>
      <p className="text-[10px] text-muted -mt-2">
        Applied on public pages for this club. Logged-in users see their own preference.
      </p>

      <div className="space-y-1.5">
        <label className={labelCls}>Date Format</label>
        <div className="flex flex-wrap gap-2">
          {DATE_FORMAT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ date_format: value })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-40 ${
                currentDateFormat === value
                  ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Time Format</label>
        <div className="flex gap-2">
          {(['24h', '12h'] as const).map((v) => (
            <button
              key={v}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ time_format: v })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-40 ${
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

      <div className="space-y-1.5">
        <label htmlFor="club-timezone" className={labelCls}>Timezone</label>
        <select
          id="club-timezone"
          value={currentTimezone}
          onChange={(e) => mutation.mutate({ timezone: e.target.value })}
          disabled={mutation.isPending}
          className={inputCls}
        >
          {!TIMEZONES.includes(currentTimezone) && (
            <option value={currentTimezone}>{currentTimezone}</option>
          )}
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Join Requests Section
// ---------------------------------------------------------------------------

function JoinRequestsSection({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient()
  const prefs = useRegionalPrefs()

  const { data } = useQuery({
    queryKey: ['club', clubId, 'join-requests', 'pending'],
    queryFn: () => clubsApi.listJoinRequests(clubId, 'pending'),
  })

  const decideMutation = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: 'approved' | 'rejected' }) =>
      clubsApi.decideJoinRequest(clubId, requestId, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'join-requests', 'pending'] })
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast('Request decided', 'success')
    },
    onError: () => toast('Failed to decide request', 'error'),
  })

  const requests = data?.items ?? []

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Pending Join Requests</h2>
        <span className="text-[11px] text-muted font-mono">{requests.length}</span>
      </div>

      {requests.length === 0 && (
        <p className="text-sm text-muted text-center py-4">No pending requests.</p>
      )}

      {requests.map(req => (
        <div key={req.id} className="flex items-center justify-between py-2 border-b border-subtle last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            {req.avatar_url ? (
              <img src={req.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[var(--brass)]/10 flex items-center justify-center shrink-0">
                <span className="text-[9px] text-[var(--brass)]">
                  {(req.display_name?.[0] ?? '?').toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm text-secondary truncate">{req.display_name ?? 'Member'}</p>
              <p className="text-[10px] text-muted font-mono">
                {formatDate(req.created_at, prefs)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => decideMutation.mutate({ requestId: req.id, decision: 'approved' })}
              disabled={decideMutation.isPending}
              className="p-1.5 rounded border border-[var(--success-text)]/30 text-[var(--success-text)] hover:bg-[var(--success-text)]/10 transition-colors disabled:opacity-40"
              title="Approve"
              aria-label={`Approve ${req.display_name ?? 'request'}`}
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => decideMutation.mutate({ requestId: req.id, decision: 'rejected' })}
              disabled={decideMutation.isPending}
              className="p-1.5 rounded border border-[var(--error-text)]/30 text-[var(--error-text)] hover:bg-[var(--error-text)]/10 transition-colors disabled:opacity-40"
              title="Reject"
              aria-label={`Reject ${req.display_name ?? 'request'}`}
            >
              <XIcon size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Members Section
// ---------------------------------------------------------------------------

function MembersSection({ clubId, currentUserId }: { clubId: string; currentUserId: string }) {
  const queryClient = useQueryClient()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmRole, setConfirmRole] = useState<{ userId: string; displayName: string; promote: boolean } | null>(null)

  const { data } = useQuery({
    queryKey: ['club', clubId, 'members'],
    queryFn: () => clubsApi.listMembers(clubId),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => clubsApi.removeMember(clubId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast('Member removed', 'success')
    },
    onError: () => toast('Failed to remove member', 'error'),
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      clubsApi.updateMember(clubId, userId, { is_admin: isAdmin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      toast('Role updated', 'success')
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Failed to update role'
      toast(msg, 'error')
    },
  })

  const members = data?.items ?? []
  const adminCount = members.filter(m => m.is_admin).length

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Members</h2>
        <span className="text-[11px] text-muted font-mono">{members.length}</span>
      </div>

      {members.map((member: ClubMember) => (
        <div key={member.user_id} className="flex items-center justify-between py-2 border-b border-subtle last:border-0">
          <div className="flex items-center gap-2">
            {member.avatar_url ? (
              <img src={member.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[var(--brass)]/10 flex items-center justify-center">
                <span className="text-[9px] text-[var(--brass)]">{member.display_name[0]?.toUpperCase()}</span>
              </div>
            )}
            <span className="text-sm text-secondary">{member.display_name}</span>
            {member.is_admin && (
              <span className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-[var(--brass)] bg-[var(--brass)]/10 px-1.5 py-0.5 rounded">
                <Shield size={10} /> Admin
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted font-mono">
              {member.joined_at.slice(0, 10)}
            </span>
            {member.user_id !== currentUserId && (
              <>
                <button
                  onClick={() => setConfirmRole({
                    userId: member.user_id,
                    displayName: member.display_name,
                    promote: !member.is_admin,
                  })}
                  disabled={roleMutation.isPending || (member.is_admin && adminCount <= 1)}
                  className="p-1 rounded text-muted hover:text-[var(--brass)] hover:bg-[var(--brass)]/10 transition-colors disabled:opacity-30"
                  title={member.is_admin ? 'Demote from admin' : 'Promote to admin'}
                >
                  {member.is_admin ? <ShieldOff size={14} /> : <Shield size={14} />}
                </button>
                {!member.is_admin && (
                  <button
                    onClick={() => setConfirmRemove(member.user_id)}
                    disabled={removeMutation.isPending}
                    className="p-1 rounded text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Remove member"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove member?"
        message="This member will be removed from the club."
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirmRemove) removeMutation.mutate(confirmRemove)
          setConfirmRemove(null)
        }}
        onCancel={() => setConfirmRemove(null)}
      />

      <ConfirmDialog
        open={!!confirmRole}
        title={confirmRole?.promote ? 'Promote to admin?' : 'Demote from admin?'}
        message={confirmRole?.promote
          ? `${confirmRole.displayName} will be able to manage club settings and members.`
          : `${confirmRole?.displayName} will no longer be able to manage club settings and members.`}
        confirmLabel={confirmRole?.promote ? 'Promote' : 'Demote'}
        onConfirm={() => {
          if (confirmRole) roleMutation.mutate({ userId: confirmRole.userId, isAdmin: confirmRole.promote })
          setConfirmRole(null)
        }}
        onCancel={() => setConfirmRole(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Leave Club Section
// ---------------------------------------------------------------------------

function LeaveSection({ clubId, members, currentUserId }: { clubId: string; members: ClubMember[]; currentUserId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmLeave, setConfirmLeave] = useState(false)

  const currentMember = members.find(m => m.user_id === currentUserId)
  const adminCount = members.filter(m => m.is_admin).length
  const isLastAdmin = currentMember?.is_admin && adminCount <= 1

  const leaveMutation = useMutation({
    mutationFn: () => clubsApi.leave(clubId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Left club', 'success')
      navigate({ to: '/clubs' })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Failed to leave club'
      toast(msg, 'error')
    },
  })

  return (
    <div className={sectionCls}>
      <h2 className="text-[11px] tracking-widest uppercase text-muted">Danger Zone</h2>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-secondary">Leave this club</p>
          {isLastAdmin && (
            <p className="text-[11px] text-muted">Promote another member to admin first.</p>
          )}
        </div>
        <button
          onClick={() => setConfirmLeave(true)}
          disabled={!!isLastAdmin || leaveMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-widest uppercase border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors disabled:opacity-30"
        >
          <LogOut size={12} />
          Leave
        </button>
      </div>
      <ConfirmDialog
        open={confirmLeave}
        title="Leave club?"
        message="You will no longer be a member of this club. You can rejoin later."
        confirmLabel="Leave"
        onConfirm={() => { setConfirmLeave(false); leaveMutation.mutate() }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ClubSettings() {
  const { id } = useParams({ from: '/app/clubs/$id/settings' })
  const navigate = useNavigate()
  const currentUser = useAuthStore(s => s.user)

  const { data: club, isLoading: clubLoading } = useQuery({
    queryKey: ['club', id],
    queryFn: () => clubsApi.get(id),
  })

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['club', id, 'members'],
    queryFn: () => clubsApi.listMembers(id),
    enabled: !!club?.is_member,
  })

  const isLoading = clubLoading || membersLoading
  const isAdmin = club?.is_admin ?? false

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate({ to: '/clubs/$id', params: { id } })
    }
  }, [isLoading, isAdmin, navigate, id])

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-4 max-w-lg lg:max-w-3xl mx-auto">
        <div className="h-6 w-40 bg-surface rounded animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-surface rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (!club) {
    return (
      <div className="p-4 text-center py-16">
        <p className="text-red-400 text-sm">Club not found.</p>
        <Link to="/clubs" className="block mt-4 text-[11px] tracking-widest uppercase text-[var(--brass)]">Back</Link>
      </div>
    )
  }

  if (!isAdmin) return null

  const members = membersData?.items ?? []

  return (
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/clubs/$id" params={{ id }} className="text-muted hover:text-secondary transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-lg font-medium tracking-widest uppercase text-secondary">Club Settings</h1>
      </div>

      <p className="text-xs text-muted">{club.name}</p>

      <ClubImageSection clubId={id} club={club} />
      <GeneralInfoSection clubId={id} club={club} />
      <PrivacySection clubId={id} club={club} />
      <RegionalSection clubId={id} club={club} />
      {club.join_policy === 'approval' && <JoinRequestsSection clubId={id} />}
      <MembersSection clubId={id} currentUserId={currentUser!.id} />
      <LeaveSection clubId={id} members={members} currentUserId={currentUser!.id} />
    </div>
  )
}
