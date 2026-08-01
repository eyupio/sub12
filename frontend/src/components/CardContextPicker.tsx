import { useQuery } from '@tanstack/react-query'

import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { ChipSelector } from './ChipSelector'
import type { CardContext } from '../utils/cardContext'

interface CardContextPickerProps {
  context: CardContext
  onContextChange: (context: CardContext) => void
  leagueId: string | null
  onLeagueChange: (id: string | null) => void
  clubId: string | null
  onClubChange: (id: string | null) => void
  selectClassName?: string
  /** Set when league policy has locked the card; the controls go read-only. */
  disabledReason?: string
}

const defaultSelectCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-[var(--brass)]/50'

/**
 * Personal / League / Club, with the matching picker underneath. Used wherever
 * a card's context can be set or changed — quick capture, the refine form and
 * the card's own edit mode — so the answer given at capture is never final.
 */
export function CardContextPicker({
  context,
  onContextChange,
  leagueId,
  onLeagueChange,
  clubId,
  onClubChange,
  selectClassName,
  disabledReason,
}: CardContextPickerProps) {
  const locked = !!disabledReason
  const { data: myLeagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: !locked && context === 'league',
  })
  const { data: myClubs } = useQuery({
    queryKey: ['my-clubs'],
    queryFn: () => clubsApi.listMine(),
    enabled: !locked && context === 'club',
  })

  const selectCls = selectClassName ?? defaultSelectCls

  if (locked) {
    return (
      <p className="text-xs text-secondary">
        {disabledReason}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <ChipSelector<CardContext>
        ariaLabel="Card context"
        value={context}
        allowClear={false}
        onChange={(v) => {
          if (!v) return
          onContextChange(v)
          // Dropping back to personal clears both links, so a half-set league
          // can't ride along invisibly.
          if (v === 'personal') {
            onLeagueChange(null)
            onClubChange(null)
          }
        }}
        options={[
          { value: 'personal', label: 'Personal' },
          { value: 'league', label: 'League' },
          { value: 'club', label: 'Club' },
        ]}
      />
      {context === 'league' && (
        <select
          aria-label="League"
          value={leagueId ?? ''}
          onChange={(e) => onLeagueChange(e.target.value || null)}
          className={selectCls}
        >
          <option value="">Select league…</option>
          {(myLeagues?.items ?? []).map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}
      {context === 'club' && (
        <select
          aria-label="Club"
          value={clubId ?? ''}
          onChange={(e) => onClubChange(e.target.value || null)}
          className={selectCls}
        >
          <option value="">Select club…</option>
          {(myClubs?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
