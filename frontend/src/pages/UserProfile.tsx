import { useParams, useRouter } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, MapPin, Users, UserPlus, UserMinus, Target, Star, Award, Eye, Crosshair, Calendar, Trophy } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { usersApi } from '../api/users'
import { achievementApi, Achievement } from '../api/achievements'

const achievementIconMap: Record<string, typeof Target> = {
  target: Target,
  star: Star,
  award: Award,
  eye: Eye,
  crosshair: Crosshair,
  calendar: Calendar,
  trophy: Trophy,
}

function AchievementsSection({ achievements }: { achievements: Achievement[] }) {
  if (achievements.length === 0) return null
  return (
    <div>
      <h2 className="text-[11px] tracking-widest uppercase text-muted mb-3">Achievements</h2>
      <div className="flex flex-wrap gap-2">
        {achievements.map((a) => {
          const Icon = achievementIconMap[a.icon]
          return (
            <span
              key={a.id}
              title={a.description}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--brass)]/40 bg-[var(--brass)]/20 text-[var(--brass)] text-[11px] tracking-widest uppercase font-medium"
            >
              {Icon && <Icon size={11} />}
              {a.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function UserProfile() {
  const { id } = useParams({ strict: false })
  const router = useRouter()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['user-profile', id],
    queryFn: () => usersApi.getProfile(id!),
    enabled: !!id,
  })

  const { data: achievementsData } = useQuery({
    queryKey: ['achievements', 'user', id],
    queryFn: () => achievementApi.listForUser(id!),
    enabled: !!id,
  })

  const followMutation = useMutation({
    mutationFn: () =>
      profile?.is_following ? usersApi.unfollow(id!) : usersApi.follow(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile', id] })
    },
  })

  const initials = profile?.display_name
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?'

  const isOwnProfile = currentUser?.id === id

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
                  <p className="text-lg font-medium text-primary">{profile.display_name}</p>
                  {!isOwnProfile && (
                    <button
                      onClick={() => followMutation.mutate()}
                      disabled={followMutation.isPending}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-40 ${
                        profile.is_following
                          ? 'border-subtle text-muted hover:border-[var(--error-text)]/40 hover:text-[var(--error-text)]'
                          : 'border-[var(--brass)]/30 bg-[var(--brass)]/10 text-[var(--brass)] hover:bg-[var(--brass)]/20'
                      }`}
                    >
                      {profile.is_following ? (
                        <>
                          <UserMinus size={12} />
                          Unfollow
                        </>
                      ) : (
                        <>
                          <UserPlus size={12} />
                          Follow
                        </>
                      )}
                    </button>
                  )}
                </div>

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
              </div>
            </div>

            {/* Follow stats */}
            <div className="mt-4 pt-4 border-t border-subtle flex gap-6">
              <div>
                <p className="text-lg font-mono font-medium text-secondary">{profile.follower_count}</p>
                <p className="text-[10px] tracking-widest uppercase text-muted">Followers</p>
              </div>
              <div>
                <p className="text-lg font-mono font-medium text-secondary">{profile.following_count}</p>
                <p className="text-[10px] tracking-widest uppercase text-muted">Following</p>
              </div>
            </div>
          </div>

          {/* Joined date */}
          <p className="text-[11px] text-muted tracking-wide">
            Member since {new Date(profile.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })}
          </p>

          {/* Achievements */}
          <AchievementsSection achievements={achievementsData?.items ?? []} />
        </>
      )}
    </div>
  )
}
