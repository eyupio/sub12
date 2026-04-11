import { useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Users, Trophy } from 'lucide-react'
import { leagueApi, LeagueStanding } from '../api/leagues'

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-[#D4A44A] font-mono text-sm font-semibold">1st</span>
  if (rank === 2) return <span className="text-slate-300 font-mono text-sm font-semibold">2nd</span>
  if (rank === 3) return <span className="text-amber-700 font-mono text-sm font-semibold">3rd</span>
  return <span className="font-mono text-sm text-white/40">{rank}th</span>
}

function StandingRow({ standing }: { standing: LeagueStanding }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0">
      <div className="w-10 text-center">
        <RankBadge rank={standing.rank} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 truncate">{standing.username}</p>
        <p className="text-[11px] text-white/25">
          {standing.card_count} card{standing.card_count !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="text-right font-mono shrink-0">
        {standing.best_score != null ? (
          <>
            <span className="text-lg font-semibold text-white">{standing.best_score}</span>
            {standing.best_x != null && standing.best_x > 0 && (
              <span className="text-xs text-[#D4A44A] ml-1.5">{standing.best_x}X</span>
            )}
          </>
        ) : (
          <span className="text-white/20 text-sm">—</span>
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

  const { data: standings, isLoading, isError } = useQuery({
    queryKey: ['leagues', id, 'standings'],
    queryFn: () => leagueApi.standings(id),
  })

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
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/leagues" className="text-white/30 hover:text-white/60 transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-medium tracking-widest uppercase text-white/80 truncate">
            {isLoading ? <span className="inline-block h-5 w-40 bg-white/[0.06] rounded animate-pulse" /> : 'League'}
          </h1>
        </div>
      </div>

      {/* Join action */}
      {!joinSuccess && (
        <div className="flex items-center justify-between border border-white/[0.06] rounded p-3 bg-white/[0.02]">
          <div className="flex items-center gap-2 text-white/40 text-xs tracking-widest uppercase">
            <Users size={14} />
            Public league
          </div>
          <button
            onClick={() => { setJoinError(''); joinMutation.mutate() }}
            disabled={joinMutation.isPending}
            className="text-[11px] tracking-widest uppercase bg-[#D4A44A] hover:bg-[#E0B35A] disabled:opacity-50 text-[#0C0C0C] font-medium px-4 py-1.5 rounded transition-colors"
          >
            {joinMutation.isPending ? 'Joining…' : 'Join'}
          </button>
        </div>
      )}

      {joinSuccess && (
        <div className="flex items-center gap-2 border border-green-500/20 rounded p-3 bg-green-500/5 text-green-400 text-xs tracking-widest uppercase">
          <Trophy size={14} />
          You've joined this league
        </div>
      )}

      {joinError && (
        <p className="text-amber-400 text-xs">{joinError}</p>
      )}

      {/* Standings */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] tracking-widest uppercase text-white/30">Standings</h2>
          <span className="text-[11px] tracking-widest uppercase text-white/20">Best score</span>
        </div>

        {isLoading && (
          <div className="space-y-px pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-white/[0.02] rounded animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400 text-sm pt-2">Failed to load standings.</p>
        )}

        {standings && standings.items.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white/20 text-sm tracking-widest uppercase">No members yet</p>
          </div>
        )}

        {standings && standings.items.length > 0 && (
          <div className="border border-white/[0.06] rounded bg-white/[0.02] px-3 mt-2">
            {standings.items.map(standing => (
              <StandingRow key={standing.user_id} standing={standing} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
