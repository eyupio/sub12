import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trophy, ChevronRight, Crosshair, ArrowLeftRight } from 'lucide-react'
import { pelletTestApi, PelletTestSessionSummary } from '../api/pelletTesting'
import { gearApi, Rifle } from '../api/gear'
import GroupSizeTimeline from '../components/GroupSizeTimeline'

function StatCard({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-5">
      <p className="text-[10px] tracking-widest uppercase text-muted">{label}</p>
      <p className={`text-2xl lg:text-3xl font-mono font-normal mt-1 ${gold ? 'text-[var(--brass)]' : 'text-secondary'}`}>
        {value}
      </p>
    </div>
  )
}

function formatDistance(m: number, unit: string): string {
  if (unit === 'yards') {
    return `${(m / 0.9144).toFixed(0)} yd`
  }
  return `${m} m`
}

export default function PelletTesting() {
  const { data: stats } = useQuery({
    queryKey: ['pellet-test-stats'],
    queryFn: () => pelletTestApi.stats(),
  })

  const { data: testsData } = useQuery({
    queryKey: ['pellet-tests'],
    queryFn: () => pelletTestApi.list(10, 0),
  })

  const { data: riflesData } = useQuery({
    queryKey: ['rifles'],
    queryFn: () => gearApi.listRifles(),
  })

  const recentTests = testsData?.items ?? []
  const rifles = riflesData?.items?.filter((r: Rifle) => r.is_active) ?? []

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Pellet Testing</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/pellet-testing/compare"
            className="flex items-center gap-1.5 px-4 py-2 rounded border border-subtle text-sm font-medium tracking-widest uppercase text-muted hover:text-secondary hover:border-[var(--brass)]/30 transition-colors"
          >
            <ArrowLeftRight size={14} />
            Compare
          </Link>
          <Link
          to="/pellet-testing/new"
          className="flex items-center gap-1.5 px-4 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase hover:opacity-90 transition-opacity"
        >
          <Plus size={14} />
          New Test
        </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard
          label="Tests Logged"
          value={stats ? String(stats.total_tests) : '—'}
        />
        <StatCard
          label="Best Group"
          value={stats?.best_group_mm != null ? `${stats.best_group_mm.toFixed(2)}mm` : '—'}
          gold
        />
        <StatCard
          label="Avg Group"
          value={stats?.avg_group_mm != null ? `${stats.avg_group_mm.toFixed(2)}mm` : '—'}
        />
        <StatCard
          label="Top Pellet"
          value={stats?.most_tested_pellet ?? '—'}
        />
      </div>

      {/* Quick actions */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-6 lg:space-y-0">

        {/* Recent Tests */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] tracking-widest uppercase text-muted">Recent Tests</h2>
          </div>
          {recentTests.length === 0 ? (
            <Link
              to="/pellet-testing/new"
              className="block text-center p-6 border border-dashed border-subtle rounded-lg text-sm text-muted hover:border-[var(--brass)]/30 transition-colors"
            >
              <Crosshair size={24} className="mx-auto mb-2 opacity-40" />
              Log your first pellet test
            </Link>
          ) : (
            <div className="space-y-2">
              {recentTests.map((test: PelletTestSessionSummary) => (
                <Link
                  key={test.id}
                  to="/pellet-testing/$id"
                  params={{ id: test.id }}
                  className="flex items-center justify-between p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-secondary font-medium truncate">
                      {test.pellet_brand} {test.pellet_model}
                    </p>
                    <p className="text-[11px] text-muted tracking-wide">
                      {test.rifle_make} {test.rifle_model} · {formatDistance(test.distance_m, test.distance_unit)} · {test.test_date}
                    </p>
                  </div>
                  <div className="text-right shrink-0 font-mono ml-3">
                    {test.best_group_size_mm != null ? (
                      <span className="text-lg font-semibold text-[var(--brass)]">{test.best_group_size_mm.toFixed(2)}<span className="text-xs ml-0.5">mm</span></span>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                    {test.group_count > 0 && (
                      <p className="text-[10px] text-muted">{test.group_count} group{test.group_count !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Leaderboard quick view */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] tracking-widest uppercase text-muted">Leaderboards</h2>
            <Link
              to="/pellet-testing/leaderboard"
              className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
            >
              View All →
            </Link>
          </div>
          {rifles.length === 0 ? (
            <Link
              to="/gear"
              className="block text-center p-6 border border-dashed border-subtle rounded-lg text-sm text-muted hover:border-[var(--brass)]/30 transition-colors"
            >
              Add a rifle to start tracking pellet performance
            </Link>
          ) : (
            <div className="space-y-2">
              {rifles.slice(0, 4).map((rifle: Rifle) => (
                <RifleLeaderboardPreview key={rifle.id} rifle={rifle} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Group Size Timeline */}
      {rifles.length > 0 && (
        <div className="p-4 rounded border border-subtle bg-surface">
          <GroupSizeTimeline rifleId={rifles[0].id} />
        </div>
      )}
    </div>
  )
}

function RifleLeaderboardPreview({ rifle }: { rifle: Rifle }) {
  const { data } = useQuery({
    queryKey: ['pellet-test-leaderboard', rifle.id],
    queryFn: () => pelletTestApi.leaderboard(rifle.id),
  })

  const top = data?.items?.[0]

  return (
    <Link
      to="/pellet-testing/leaderboard"
      className="flex items-center gap-3 p-3 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
    >
      <Trophy size={16} className={top ? 'text-[var(--brass)]' : 'text-muted opacity-40'} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-secondary font-medium truncate">{rifle.make} {rifle.model}</p>
        {top ? (
          <p className="text-[11px] text-muted">
            Best: {top.pellet_brand} {top.pellet_model} — {top.best_group_mm.toFixed(2)}mm
          </p>
        ) : (
          <p className="text-[11px] text-muted">No tests yet</p>
        )}
      </div>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </Link>
  )
}
