import { Avatar, Sparkline, Trend } from './atoms'
import type { Column, StandingRow } from './LeagueTable'

export function rankColumn<R extends StandingRow>(): Column<R> {
  return {
    key: 'rank',
    label: '#',
    sortable: true,
    width: 56,
    sortValue: (r) => r.rank,
    render: (r) => {
      const cls =
        r.rank === 1 ? 'lc-rank-1' :
        r.rank === 2 ? 'lc-rank-2' :
        r.rank === 3 ? 'lc-rank-3' :
        'lc-rank-other'
      return <span className={`lc-rank-cell ${cls}`}>{r.rank}</span>
    },
  }
}

export function shooterColumn<R extends StandingRow>(): Column<R> {
  return {
    key: 'name',
    label: 'Shooter',
    sortable: true,
    sortValue: (r) => r.name,
    render: (r) => (
      <div className="lc-shooter-cell">
        <Avatar name={r.name} size="md" src={r.avatarUrl} />
        <div>
          <div>
            <span className="lc-shooter-name">{r.name}</span>
            {r.isMe && <span className="lc-you-tag">You</span>}
          </div>
          {r.handle && <div className="lc-shooter-handle">@{r.handle}</div>}
        </div>
      </div>
    ),
  }
}

export function cardsColumn<R extends StandingRow>(): Column<R> {
  return {
    key: 'cards',
    label: 'Cards',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.cards ?? 0,
    render: (r) => <span>{r.cards ?? 0}</span>,
  }
}

export function bestColumn<R extends StandingRow>(): Column<R> {
  return {
    key: 'best',
    label: 'Best',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.best ?? 0,
    render: (r) => (
      <span style={{ fontWeight: 600 }}>
        {r.best ?? '—'}
        {r.bestX != null && <span className="lc-best-x">{r.bestX}X</span>}
      </span>
    ),
  }
}

export function avgColumn<R extends StandingRow>(): Column<R> {
  return {
    key: 'avg',
    label: 'Avg',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.avg ?? 0,
    render: (r) => <span>{r.avg != null ? r.avg.toFixed(1) : '—'}</span>,
  }
}

export function recentColumn<R extends StandingRow>(): Column<R> {
  return {
    key: 'recent',
    label: 'Last 6',
    align: 'center',
    sortable: false,
    render: (r) => <Sparkline values={r.recent ?? []} />,
  }
}

export function trendColumn<R extends StandingRow>(): Column<R> {
  return {
    key: 'trend',
    label: 'Trend',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.trend ?? 0,
    render: (r) => <Trend delta={r.trend} />,
  }
}

export function xColumn<R extends StandingRow>(): Column<R> {
  return {
    key: 'x',
    label: 'X',
    align: 'right',
    sortable: true,
    sortValue: (r) => r.bestX ?? 0,
    render: (r) => <span style={{ color: 'var(--gold)' }}>{r.bestX ?? 0}</span>,
  }
}
