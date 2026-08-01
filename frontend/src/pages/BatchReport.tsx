import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { pelletTestApi, type BatchReportEntry } from '../api/pelletTesting'

export default function BatchReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['pellet-test-batch-report'],
    queryFn: () => pelletTestApi.batchReport(),
  })

  const items: BatchReportEntry[] = (data as { items?: BatchReportEntry[] })?.items ?? (Array.isArray(data) ? data : [])

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-3xl mx-auto">
      <div>
        <Link to="/pellet-testing" className="flex items-center gap-1 t-section-title hover:text-secondary transition-colors mb-3">
          <ChevronLeft size={14} /> Back
        </Link>
        <h1 className="t-page-title">
          Batch / Lot Tracking
        </h1>
        <p className="text-sm text-muted mt-1">
          Compare pellet performance across production batches and lot numbers.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded skeleton" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted text-sm">
            No batch data yet. Add batch/lot codes to your pellets in{' '}
            <Link to="/gear" className="text-[var(--brass)] hover:underline">Gear</Link>.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle text-[10px] tracking-widest uppercase text-muted">
                <th className="text-left py-2 pr-3">Batch</th>
                <th className="text-left py-2 pr-3">Pellet</th>
                <th className="text-right py-2 pr-3">Tests</th>
                <th className="text-right py-2 pr-3">Groups</th>
                <th className="text-right py-2 pr-3">Best</th>
                <th className="text-right py-2 pr-3">Avg</th>
                <th className="text-right py-2">Consistency</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.batch_code} className="border-b border-subtle/50 hover:bg-surface-hover transition-colors">
                  <td className="py-2.5 pr-3">
                    <span className="font-mono text-secondary">{entry.batch_code}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-muted">
                    {entry.pellet_brand} {entry.pellet_model}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-muted">{entry.test_count}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-muted">{entry.total_groups}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-[var(--brass)]">
                    {entry.best_group_mm != null ? `${entry.best_group_mm.toFixed(2)}mm` : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-secondary">
                    {entry.avg_group_mm != null ? `${entry.avg_group_mm.toFixed(2)}mm` : '—'}
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    {entry.consistency_score != null ? (
                      <span className={entry.consistency_score < 1.0 ? 'text-green-400' : entry.consistency_score < 2.0 ? 'text-amber-400' : 'text-red-400'}>
                        σ {entry.consistency_score.toFixed(2)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
