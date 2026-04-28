import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoriesApi } from '../../api/categories'
import type { EventFormat, EventVisibility } from '../../api/events'
import { WIZARD_LABEL_CLS, toggleCls, type WizardState } from './wizardShared'

interface Props {
  state: WizardState
  onChange: (next: WizardState) => void
  clubId?: string
}

const FORMAT_LABELS: Record<EventFormat, string> = {
  shot_grid: 'Shot grid (per-shot tap)',
  card_submission: 'Card submission (25-shot card)',
}

export function FormatStep({ state, onChange, clubId }: Props) {
  const { format } = state
  const { data: catsData } = useQuery({
    queryKey: ['categories', 'public'],
    queryFn: () => categoriesApi.listPublic(),
  })
  const categories = catsData?.items ?? []

  // Visibility options depend on whether the event is hosted by a club:
  //   - club-owned: Public or Club only
  //   - personal:   Public or Private (unlisted)
  const visibilityOptions = useMemo<{ value: EventVisibility; label: string }[]>(
    () =>
      clubId
        ? [
            { value: 'public', label: 'Public' },
            { value: 'club_only', label: 'Club only' },
          ]
        : [
            { value: 'public', label: 'Public' },
            { value: 'unlisted', label: 'Private' },
          ],
    [clubId],
  )

  // Snap visibility back to a valid value when the context changes (e.g. user
  // entered the wizard with a clubId set, then navigated away from it).
  useEffect(() => {
    const isValid = visibilityOptions.some((o) => o.value === format.visibility)
    if (!isValid) {
      onChange({ ...state, format: { ...format, visibility: clubId ? 'club_only' : 'public' } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, visibilityOptions])

  function toggleCategory(id: string) {
    const has = format.categoryIds.includes(id)
    const next = has ? format.categoryIds.filter((x) => x !== id) : [...format.categoryIds, id]
    onChange({ ...state, format: { ...format, categoryIds: next } })
  }

  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-5">
      <header>
        <h2 className="t-subsection-title">Format</h2>
        <p className="text-sm text-muted">How shooters will record results, and who can find this event.</p>
      </header>

      <div>
        <span className={WIZARD_LABEL_CLS}>Format</span>
        <div className="flex flex-wrap gap-2">
          {(['shot_grid', 'card_submission'] as EventFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onChange({ ...state, format: { ...format, format: f } })}
              className={toggleCls(format.format === f)}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={WIZARD_LABEL_CLS}>Visibility</span>
        <div className="flex gap-2">
          {visibilityOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange({ ...state, format: { ...format, visibility: o.value } })}
              className={`${toggleCls(format.visibility === o.value)} flex-1`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={WIZARD_LABEL_CLS}>Categories</span>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCategory(c.id)}
              className={toggleCls(format.categoryIds.includes(c.id))}
            >
              {c.label}
            </button>
          ))}
          {categories.length === 0 && <p className="text-xs text-muted">No categories available.</p>}
        </div>
      </div>
    </section>
  )
}
