import { customPreset, disciplinePresets } from '../../config/disciplinePresets'
import { PlaceSelector } from '../PlaceSelector'
import type { LocationValue } from '../LocationField'
import {
  WIZARD_INPUT_CLS,
  WIZARD_LABEL_CLS,
  applyPreset,
  toggleCls,
  type WizardState,
} from './wizardShared'

interface Props {
  state: WizardState
  onChange: (next: WizardState) => void
}

export function BasicsStep({ state, onChange }: Props) {
  const { basics } = state
  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-5">
      <header>
        <h2 className="t-subsection-title">Basics</h2>
        <p className="text-sm text-muted">Name, where you're shooting, and the discipline.</p>
      </header>

      <label className="block">
        <span className={WIZARD_LABEL_CLS}>Name</span>
        <input
          className={WIZARD_INPUT_CLS}
          value={basics.name}
          autoFocus
          placeholder="Spring HFT shoot"
          onChange={(e) => onChange({ ...state, basics: { ...basics, name: e.target.value } })}
        />
      </label>

      <label className="block">
        <span className={WIZARD_LABEL_CLS}>Description (optional)</span>
        <textarea
          rows={2}
          className={`${WIZARD_INPUT_CLS} resize-none`}
          value={basics.description}
          onChange={(e) => onChange({ ...state, basics: { ...basics, description: e.target.value } })}
        />
      </label>

      <div className="block">
        <span className={WIZARD_LABEL_CLS}>Location (optional)</span>
        <PlaceSelector
          locationId={basics.locationId}
          onLocationIdChange={(id) =>
            onChange({ ...state, basics: { ...basics, locationId: id } })
          }
          location={{
            label: basics.location,
            lat: basics.locationLat,
            lng: basics.locationLng,
          }}
          onLocationChange={(value: LocationValue) =>
            onChange({
              ...state,
              basics: {
                ...basics,
                location: value.label,
                locationLat: value.lat,
                locationLng: value.lng,
              },
            })
          }
          inputClassName={WIZARD_INPUT_CLS}
        />
      </div>

      <div>
        <span className={WIZARD_LABEL_CLS}>Discipline preset</span>
        <div className="flex flex-wrap gap-2">
          {[...disciplinePresets, customPreset].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(applyPreset(state, p.id))}
              className={toggleCls(basics.presetId === p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className={WIZARD_LABEL_CLS}>Discipline</span>
        <input
          className={WIZARD_INPUT_CLS}
          placeholder="HFT, FT, …"
          value={basics.discipline}
          onChange={(e) => onChange({ ...state, basics: { ...basics, discipline: e.target.value } })}
        />
      </label>
    </section>
  )
}
