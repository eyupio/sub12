import { useQuery } from '@tanstack/react-query'
import { pelletTestApi, type PublicLeaderboardEntry } from '../api/pelletTesting'

export default function PublicPelletLeaderboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['pellet-test-public-leaderboard'],
    queryFn: () => pelletTestApi.publicLeaderboard(50, 0),
  })

  const items: PublicLeaderboardEntry[] = (data as { items?: PublicLeaderboardEntry[] })?.items ?? (Array.isArray(data) ? data : [])

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">
          Pellet Leaderboard
        </h1>
        <p className="text-sm text-muted mt-1">
          Community-sourced pellet performance rankings. Opt in from your pellet test sessions.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 rounded bg-surface animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted text-sm">
            No public pellet test data yet. Users can opt in by making their test sessions public.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle text-[10px] tracking-widest uppercase text-muted">
                <th className="text-left py-2 pr-2 w-8">#</th>
                <th className="text-left py-2 pr-3">Pellet</th>
                <th className="text-right py-2 pr-3">Head</th>
                <th className="text-right py-2 pr-3">Weight</th>
                <th className="text-right py-2 pr-3">Best</th>
                <th className="text-right py-2 pr-3">Avg</th>
                <th className="text-right py-2 pr-3">Shooters</th>
                <th className="text-right py-2 pr-3">Tests</th>
                <th className="text-right py-2">Groups</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={`${entry.pellet_brand}-${entry.pellet_model}-${entry.head_size_mm}`} className="border-b border-subtle/50 hover:bg-surface-hover transition-colors">
                  <td className="py-2.5 pr-2">
                    <span className={`font-mono text-xs ${entry.rank <= 3 ? 'text-[var(--brass)] font-semibold' : 'text-muted'}`}>
                      {entry.rank}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="text-secondary font-medium">{entry.pellet_brand}</span>{' '}
                    <span className="text-muted">{entry.pellet_model}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-muted">
                    {entry.head_size_mm != null ? `${entry.head_size_mm}mm` : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-muted">
                    {entry.weight_grains != null ? `${entry.weight_grains}gr` : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-[var(--brass)] font-semibold">
                    {entry.best_group_mm.toFixed(2)}mm
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-secondary">
                    {entry.avg_group_mm.toFixed(2)}mm
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-muted">{entry.user_count}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-muted">{entry.test_count}</td>
                  <td className="py-2.5 text-right font-mono text-muted">{entry.total_groups}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
