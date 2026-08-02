import type { Dispatch, SetStateAction } from 'react'

import { customPreset, disciplinePresets } from '../../config/disciplinePresets'
import { PlaceSelector } from '../PlaceSelector'
import type { LocationValue } from '../LocationField'
import {
  WIZARD_INPUT_CLS,
  WIZARD_LABEL_CLS,
  applyPreset,
  toggleCls,
  type WizardBasics,
  type WizardState,
} from './wizardShared'

interface Props {
  state: WizardState
  onChange: Dispatch<SetStateAction<WizardState>>
}

export function BasicsStep({ state, onChange }: Props) {
  const { basics } = state

  // Patches merge onto the latest state, not the one this render closed over:
  // picking a saved place sets its id and its label in the same tick, and a
  // whole-object update would drop whichever of the two landed first.
  const patchBasics = (patch: Partial<WizardBasics>) =>
    onChange((prev) => ({ ...prev, basics: { ...prev.basics, ...patch } }))
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
          onChange={(e) => patchBasics({ name: e.target.value })}
        />
      </label>

      <label className="block">
        <span className={WIZARD_LABEL_CLS}>Description (optional)</span>
        <textarea
          rows={2}
          className={`${WIZARD_INPUT_CLS} resize-none`}
          value={basics.description}
          onChange={(e) => patchBasics({ description: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <label className="block">
          <span className={WIZARD_LABEL_CLS}>Starts (optional)</span>
          <input
            type="datetime-local"
            className={WIZARD_INPUT_CLS}
            value={basics.startsAt}
            onChange={(e) => onChange({ ...state, basics: { ...basics, startsAt: e.target.value } })}
          />
        </label>
        <label className="block">
          <span className={WIZARD_LABEL_CLS}>Ends (optional)</span>
          <input
            type="datetime-local"
            className={WIZARD_INPUT_CLS}
            value={basics.endsAt}
            min={basics.startsAt || undefined}
            onChange={(e) => onChange({ ...state, basics: { ...basics, endsAt: e.target.value } })}
          />
        </label>
      </div>

      <div className="block">
        <span className={WIZARD_LABEL_CLS}>Location (optional)</span>
        <PlaceSelector
          locationId={basics.locationId}
          onLocationIdChange={(id) => patchBasics({ locationId: id })}
          location={{
            label: basics.location,
            lat: basics.locationLat,
            lng: basics.locationLng,
          }}
          onLocationChange={(value: LocationValue) =>
            patchBasics({
              location: value.label,
              locationLat: value.lat,
              locationLng: value.lng,
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
              onClick={() => onChange((prev) => applyPreset(prev, p.id))}
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
          onChange={(e) => patchBasics({ discipline: e.target.value })}
        />
      </label>
    </section>
  )
}
