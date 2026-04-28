import { useQuery } from '@tanstack/react-query'
import { categoriesApi } from '../../api/categories'
import type { EventFormat, EventVisibility } from '../../api/events'
import { WIZARD_LABEL_CLS, toggleCls, type WizardState } from './wizardShared'

interface Props {
  state: WizardState
  onChange: (next: WizardState) => void
}

const FORMAT_LABELS: Record<EventFormat, string> = {
  shot_grid: 'Shot grid (per-shot tap)',
  card_submission: 'Card submission (25-shot card)',
}

const VISIBILITY_LABELS: Record<EventVisibility, string> = {
  public: 'Public',
  club_only: 'Club only',
  unlisted: 'Unlisted',
}

export function FormatStep({ state, onChange }: Props) {
  const { format } = state
  const { data: catsData } = useQuery({
    queryKey: ['categories', 'public'],
    queryFn: () => categoriesApi.listPublic(),
  })
  const categories = catsData?.items ?? []

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
          {(['public', 'club_only', 'unlisted'] as EventVisibility[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ ...state, format: { ...format, visibility: v } })}
              className={`${toggleCls(format.visibility === v)} flex-1`}
            >
              {VISIBILITY_LABELS[v]}
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
