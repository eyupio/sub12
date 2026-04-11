import { useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Users, Trophy } from 'lucide-react'
import { leagueApi, LeagueStanding } from '../api/leagues'

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-[var(--brass)] font-mono text-sm font-semibold">1st</span>
  if (rank === 2) return <span className="text-secondary font-mono text-sm font-semibold">2nd</span>
  if (rank === 3) return <span className="text-amber-700 dark:text-amber-600 font-mono text-sm font-semibold">3rd</span>
  return <span className="font-mono text-sm text-muted">{rank}th</span>
}

function StandingRow({ standing }: { standing: LeagueStanding }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-subtle last:border-0">
      <div className="w-10 text-center">
        <RankBadge rank={standing.rank} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-secondary truncate">{standing.display_name}</p>
        <p className="text-[11px] text-muted">
          {standing.card_count} card{standing.card_count !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="text-right font-mono shrink-0">
        {standing.best_score != null ? (
          <>
            <span className="text-lg font-semibold text-primary">{standing.best_score}</span>
            {standing.best_x != null && standing.best_x > 0 && (
              <span className="text-xs text-[var(--brass)] ml-1.5">{standing.best_x}X</span>
            )}
          </>
        ) : (
          <span className="text-muted text-sm">—</span>
        )}
      </div>
    </div>
  )
}

export default function LeagueDetail() {
  const { id } = useParams({ from: '/app/leagues/$id' })
  const queryClient = useQueryClient()
  const [joinError, setJoinError] = useState('')
  const [joinSuccess, setJoinSuccess] = useState(false)

  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ['leagues', id],
    queryFn: () => leagueApi.get(id),
  })

  const { data: standings, isLoading: standingsLoading, isError } = useQuery({
    queryKey: ['leagues', id, 'standings'],
    queryFn: () => leagueApi.standings(id),
  })

  const isLoading = leagueLoading || standingsLoading

  const joinMutation = useMutation({
    mutationFn: () => leagueApi.join(id),
    onSuccess: () => {
      setJoinSuccess(true)
      setJoinError('')
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', id, 'standings'] })
    },
    onError: (err: Error) => {
      if (err.message.includes('409')) {
        setJoinError('You\'re already a member of this league.')
      } else {
        setJoinError('Failed to join. Please try again.')
      }
    },
  })

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/leagues" className="text-muted hover:text-secondary transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          {leagueLoading ? (
            <div className="h-5 w-40 bg-surface rounded animate-pulse" />
          ) : (
            <>
              <h1 className="text-lg lg:text-xl font-medium tracking-widest uppercase text-secondary truncate">
                {league?.name ?? 'League'}
              </h1>
              {league?.description && (
                <p className="text-xs text-muted truncate mt-0.5">{league.description}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Join action */}
      {!joinSuccess && (
        <div className="flex items-center justify-between border border-subtle rounded p-3 lg:p-4 bg-surface">
          <div className="flex items-center gap-2 text-muted text-xs tracking-widest uppercase">
            <Users size={14} />
            Public league
          </div>
          <button
            onClick={() => { setJoinError(''); joinMutation.mutate() }}
            disabled={joinMutation.isPending}
            className="text-[11px] tracking-widest uppercase bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium px-4 py-1.5 rounded transition-opacity"
          >
            {joinMutation.isPending ? 'Joining…' : 'Join'}
          </button>
        </div>
      )}

      {joinSuccess && (
        <div className="flex items-center gap-2 border border-[var(--success-border)] rounded p-3 lg:p-4 bg-[var(--success-bg)] text-[var(--success-text)] text-xs tracking-widest uppercase">
          <Trophy size={14} />
          You've joined this league
        </div>
      )}

      {joinError && (
        <p className="text-amber-600 dark:text-amber-400 text-xs">{joinError}</p>
      )}

      {/* Standings */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Standings</h2>
          <span className="text-[11px] tracking-widest uppercase text-muted">Best score</span>
        </div>

        {isLoading && (
          <div className="space-y-px pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-surface rounded animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-[var(--error-text)] text-sm pt-2">Failed to load standings.</p>
        )}

        {standings && standings.items.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted text-sm tracking-widest uppercase">No members yet</p>
          </div>
        )}

        {standings && standings.items.length > 0 && (
          <div className="border border-subtle rounded bg-surface px-3 lg:px-4 mt-2">
            {standings.items.map(standing => (
              <StandingRow key={standing.user_id} standing={standing} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
