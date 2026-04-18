import { useState } from 'react'
import { useParams, useRouter, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, MapPin, Users, UserPlus, UserMinus, Lock, MoreHorizontal, ShieldOff, Clock, X as XIcon } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { usersApi, FollowListItem } from '../api/users'
import { achievementApi } from '../api/achievements'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ReportDialog } from '../components/ReportDialog'
import { AchievementsSection } from '../components/AchievementsSection'
import { useRegionalPrefs } from '../utils/date'

function FollowListModal({ title, items, onClose }: { title: string; items: FollowListItem[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface border border-subtle rounded-lg w-full max-w-sm mx-4 max-h-[60vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-subtle">
          <h3 className="text-sm font-medium text-secondary tracking-widest uppercase">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-secondary transition-colors">
            <XIcon size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">No users yet.</p>
          ) : (
            items.map((item) => (
              <Link
                key={item.user_id}
                to="/users/$id"
                params={{ id: item.user_id }}
                onClick={onClose}
                className="flex items-center gap-3 p-2 rounded hover:bg-surface-hover transition-colors"
              >
                {item.avatar_url ? (
                  <img src={item.avatar_url} alt={item.display_name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-muted text-xs font-medium">
                    {item.display_name[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <span className="text-sm text-secondary">{item.display_name}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function UserProfile() {
  const { id } = useParams({ strict: false })
  const router = useRouter()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [showMenu, setShowMenu] = useState(false)
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFollowing, setShowFollowing] = useState(false)
  const [confirmUnfollow, setConfirmUnfollow] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const prefs = useRegionalPrefs()
  const memberSinceLocale =
    prefs.dateFormat === 'mdy_slash' ? 'en-US' : prefs.dateFormat === 'ymd_dash' ? 'sv-SE' : 'en-GB'

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['user-profile', id],
    queryFn: () => usersApi.getProfile(id!),
    enabled: !!id,
  })

  const { data: achievementsData } = useQuery({
    queryKey: ['achievements', 'user', id],
    queryFn: () => achievementApi.listForUser(id!),
    enabled: !!id && !profile?.is_private,
    retry: false,
  })

  const { data: achievementDefsData } = useQuery({
    queryKey: ['achievement-defs'],
    queryFn: () => achievementApi.listDefs(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: followersData } = useQuery({
    queryKey: ['followers', id],
    queryFn: () => usersApi.getFollowers(id!),
    enabled: showFollowers && !!id,
  })

  const { data: followingData } = useQuery({
    queryKey: ['following', id],
    queryFn: () => usersApi.getFollowing(id!),
    enabled: showFollowing && !!id,
  })

  const followMutation = useMutation({
    mutationFn: () => {
      if (profile?.is_following) return usersApi.unfollow(id!)
      return usersApi.follow(id!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile', id] })
      queryClient.invalidateQueries({ queryKey: ['followers', id] })
      queryClient.invalidateQueries({ queryKey: ['following', id] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      if (profile?.is_following) {
        toast(`Unfollowed ${profile?.display_name ?? 'user'}`, 'success')
      } else if (profile?.is_private) {
        toast('Follow request sent', 'success')
      } else {
        toast(`Following ${profile?.display_name ?? 'user'}`, 'success')
      }
    },
    onError: () => toast('Failed to update follow status', 'error'),
  })

  const blockMutation = useMutation({
    mutationFn: () => {
      if (profile?.is_blocked) return usersApi.unblock(id!)
      return usersApi.block(id!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile', id] })
      queryClient.invalidateQueries({ queryKey: ['followers', id] })
      queryClient.invalidateQueries({ queryKey: ['following', id] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setShowMenu(false)
      toast(profile?.is_blocked ? 'User unblocked' : 'User blocked', 'success')
    },
    onError: () => toast('Failed to update block status', 'error'),
  })

  const initials = profile?.display_name
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?'

  const isOwnProfile = currentUser?.id === id

  // Determine follow button state
  const getFollowButton = () => {
    if (!profile || isOwnProfile) return null

    if (profile.is_following) {
      return (
        <button
          onClick={() => setConfirmUnfollow(true)}
          disabled={followMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:border-[var(--error-text)]/40 hover:text-[var(--error-text)] transition-colors disabled:opacity-40"
        >
          <UserMinus size={12} />
          Unfollow
        </button>
      )
    }

    if (profile.follow_request_status === 'pending') {
      return (
        <button
          disabled
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted disabled:opacity-60"
        >
          <Clock size={12} />
          Requested
        </button>
      )
    }

    return (
      <button
        onClick={() => followMutation.mutate()}
        disabled={followMutation.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[var(--brass)]/30 bg-[var(--brass)]/10 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/20 transition-colors disabled:opacity-40"
      >
        <UserPlus size={12} />
        {profile.is_private && !profile.is_following ? 'Request' : 'Follow'}
      </button>
    )
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-2xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.history.back()}
        className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
      >
        <ChevronLeft size={14} />
        Back
      </button>

      {isLoading && (
        <div className="space-y-4">
          <div className="h-24 w-24 rounded-full bg-surface-hover animate-pulse" />
          <div className="h-5 w-40 rounded bg-surface-hover animate-pulse" />
          <div className="h-4 w-64 rounded bg-surface-hover animate-pulse" />
        </div>
      )}

      {isError && (
        <p className="text-[var(--error-text)] text-sm">Could not load profile.</p>
      )}

      {profile && (
        <>
          {/* Identity card */}
          <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-6">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full overflow-hidden border-2 border-subtle flex-shrink-0">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-surface-hover flex items-center justify-center text-muted text-xl font-medium">
                    {initials}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-lg font-medium text-primary">{profile.display_name}</p>
                    {profile.profile_visibility === 'private' && (
                      <span title="Private profile"><Lock size={14} className="text-muted" /></span>
                    )}
                    {profile.follows_you && !isOwnProfile && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-surface-hover border border-subtle text-[9px] tracking-widest uppercase text-muted">
                        Follows you
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {getFollowButton()}
                    {!isOwnProfile && (
                      <div className="relative">
                        <button
                          onClick={() => setShowMenu(!showMenu)}
                          className="p-1.5 rounded border border-subtle text-muted hover:text-secondary transition-colors"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {showMenu && (
                          <div className="absolute right-0 top-full mt-1 bg-surface border border-subtle rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                            <button
                              onClick={() => { setShowMenu(false); setShowReport(true) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] tracking-widest uppercase text-muted hover:text-secondary hover:bg-surface-hover transition-colors"
                            >
                              <AlertTriangle size={12} />
                              Report
                            </button>
                            <button
                              onClick={() => blockMutation.mutate()}
                              disabled={blockMutation.isPending}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] tracking-widest uppercase text-[var(--error-text)] hover:bg-surface-hover transition-colors disabled:opacity-40"
                            >
                              <ShieldOff size={12} />
                              {profile.is_blocked ? 'Unblock' : 'Block'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {profile.is_private ? (
                  <div className="flex items-center gap-2 py-2">
                    <Lock size={14} className="text-muted" />
                    <p className="text-sm text-muted">This profile is private. Follow this user to see their full profile.</p>
                  </div>
                ) : (
                  <>
                    {profile.bio && (
                      <p className="text-sm text-secondary leading-relaxed">{profile.bio}</p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {profile.location && (
                        <span className="flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
                          <MapPin size={12} />
                          {profile.location}
                        </span>
                      )}
                      {profile.club && (
                        <span className="flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
                          <Users size={12} />
                          {profile.club}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Follow stats */}
            <div className="mt-4 pt-4 border-t border-subtle flex gap-6">
              <button onClick={() => setShowFollowers(true)} className="text-left hover:opacity-80 transition-opacity">
                <p className="text-lg font-mono font-medium text-secondary">{profile.follower_count}</p>
                <p className="text-[10px] tracking-widest uppercase text-muted">Followers</p>
              </button>
              <button onClick={() => setShowFollowing(true)} className="text-left hover:opacity-80 transition-opacity">
                <p className="text-lg font-mono font-medium text-secondary">{profile.following_count}</p>
                <p className="text-[10px] tracking-widest uppercase text-muted">Following</p>
              </button>
            </div>
          </div>

          {/* Joined date */}
          <p className="text-[11px] text-muted tracking-wide">
            Member since {new Intl.DateTimeFormat(memberSinceLocale, { year: 'numeric', month: 'long', timeZone: prefs.timezone }).format(new Date(profile.created_at))}
          </p>

          {/* Achievements: earned list is hidden for private profiles, but the
              locked grid still renders from the public defs catalog so viewers
              can see what achievements exist. */}
          <AchievementsSection
            earned={achievementsData?.items ?? []}
            allDefs={achievementDefsData?.items ?? []}
          />

          {/* Follower/Following modals */}
          {showFollowers && (
            <FollowListModal
              title="Followers"
              items={followersData?.items ?? []}
              onClose={() => setShowFollowers(false)}
            />
          )}
          {showFollowing && (
            <FollowListModal
              title="Following"
              items={followingData?.items ?? []}
              onClose={() => setShowFollowing(false)}
            />
          )}

          <ConfirmDialog
            open={confirmUnfollow}
            title="Unfollow user?"
            message={`Stop following ${profile.display_name}? You will no longer see their activity in your For You feed.`}
            confirmLabel="Unfollow"
            onConfirm={() => {
              setConfirmUnfollow(false)
              followMutation.mutate()
            }}
            onCancel={() => setConfirmUnfollow(false)}
          />

          {id && (
            <ReportDialog
              open={showReport}
              targetType="user"
              targetId={id}
              onClose={() => setShowReport(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
