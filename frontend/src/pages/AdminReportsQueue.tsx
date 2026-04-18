import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Flag, Inbox } from 'lucide-react'
import { reportsApi, type ModerationAction, type Report, type ReportStatus } from '../api/reports'
import { toast } from '../store/toast'

function ReportTargetLink({ report }: { report: Report }) {
  const className =
    'inline-flex items-center gap-1 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:underline'

  switch (report.target_type) {
    case 'post':
      return (
        <Link to="/posts/$id" params={{ id: report.target_id }} className={className}>
          <ExternalLink size={12} /> View post
        </Link>
      )
    case 'score_card':
      return (
        <Link to="/scores/$id" params={{ id: report.target_id }} className={className}>
          <ExternalLink size={12} /> View score card
        </Link>
      )
    case 'user':
      return (
        <Link to="/users/$id" params={{ id: report.target_id }} className={className}>
          <ExternalLink size={12} /> View user
        </Link>
      )
    case 'comment':
      return (
        <span className="text-[11px] tracking-widest uppercase text-muted" title={`Comment ID: ${report.target_id}`}>
          Comment · {report.target_id.slice(0, 8)}…
        </span>
      )
    default:
      return null
  }
}

function ReportRow({ report, onDecide, disabled }: { report: Report; onDecide: (a: ModerationAction) => void; disabled: boolean }) {
  const when = useMemo(() => new Date(report.created_at).toLocaleString(), [report.created_at])
  const isOpen = report.status === 'open'

  return (
    <li className="p-3 rounded border border-subtle bg-surface space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-[var(--brass)] shrink-0">
          <Flag size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-secondary">
            <span className="font-medium">{report.reason}</span>
            <span className="text-muted"> &middot; {report.target_type.replace('_', ' ')}</span>
          </p>
          {report.notes && <p className="text-xs text-muted mt-1 whitespace-pre-wrap">{report.notes}</p>}
          <p className="text-[10px] tracking-widest uppercase text-muted mt-1">{when} &middot; {report.status}</p>
          <div className="mt-2">
            <ReportTargetLink report={report} />
          </div>
        </div>
      </div>
      {isOpen && (
        <div className="flex flex-wrap gap-2 pl-11">
          {(report.target_type === 'post' || report.target_type === 'comment') && (
            <button
              onClick={() => onDecide('hide')}
              disabled={disabled}
              className="px-3 py-1.5 rounded bg-[var(--error-text)] text-white text-[11px] tracking-widest uppercase font-medium disabled:opacity-40"
            >
              Hide
            </button>
          )}
          <button
            onClick={() => onDecide('warn_user')}
            disabled={disabled}
            className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:border-[var(--brass)]/30 transition-colors disabled:opacity-40"
          >
            Warn
          </button>
          <button
            onClick={() => onDecide('no_action')}
            disabled={disabled}
            className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors disabled:opacity-40"
          >
            Dismiss
          </button>
        </div>
      )}
    </li>
  )
}

export default function AdminReportsQueue() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<ReportStatus>('open')

  const list = useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: () => reportsApi.adminList(status),
  })

  const decide = useMutation({
    mutationFn: ({ reportId, action, notes }: { reportId: string; action: ModerationAction; notes?: string }) =>
      reportsApi.adminDecide(reportId, { action, notes }),
    onSuccess: (_data, vars) => {
      toast(vars.action === 'hide' ? 'Content hidden' : vars.action === 'warn_user' ? 'User warned' : 'Report dismissed', 'success')
      qc.invalidateQueries({ queryKey: ['admin', 'reports'] })
    },
    onError: () => toast('Failed to apply decision', 'error'),
  })

  const items = list.data?.items ?? []

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary flex items-center gap-2">
        <Inbox size={18} className="text-[var(--brass)]" /> Admin Reports Queue
      </h1>
      <p className="text-sm text-muted">Short-term destination for moderation and ticket-related notifications until the unified support inbox is live.</p>

      <div className="flex items-center gap-2">
        {(['open', 'actioned', 'dismissed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded text-[11px] tracking-widest uppercase border transition-colors ${
              status === s
                ? 'border-[var(--brass)]/50 text-secondary bg-surface'
                : 'border-subtle text-muted hover:text-secondary'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {list.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded border border-subtle bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {list.isError && (
        <p role="alert" className="text-[var(--error-text)] text-sm">Failed to load reports.</p>
      )}

      {!list.isLoading && items.length === 0 && (
        <p className="text-sm text-muted py-6 text-center">No {status} reports.</p>
      )}

      <ul className="space-y-2">
        {items.map((report) => (
          <ReportRow key={report.id} report={report} disabled={decide.isPending} onDecide={(action) => decide.mutate({ reportId: report.id, action })} />
        ))}
      </ul>
    </div>
  )
}
