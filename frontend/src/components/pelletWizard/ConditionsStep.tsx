import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PlaceSelector } from '../PlaceSelector'
import { WIZARD_INPUT_CLS, WIZARD_LABEL_CLS, type WizardConditionsValues } from './wizardShared'

interface Props {
  values: WizardConditionsValues
  onChange: (patch: Partial<WizardConditionsValues>) => void
}

export function ConditionsStep({ values, onChange }: Props) {
  const [showChrono, setShowChrono] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-5">
      <header>
        <h2 className="t-subsection-title">Setup &amp; conditions</h2>
        <p className="text-sm text-muted mt-0.5">Distance is required to compute MOA. Everything else is optional.</p>
      </header>

      {/* Distance */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={WIZARD_LABEL_CLS}>Distance</label>
          <input
            type="number"
            step="any"
            placeholder="25"
            value={values.distanceValue}
            onChange={e => onChange({ distanceValue: e.target.value })}
            className={`${WIZARD_INPUT_CLS} font-mono`}
          />
        </div>
        <div className="space-y-1.5">
          <label className={WIZARD_LABEL_CLS}>Unit</label>
          <select
            value={values.distanceUnit}
            onChange={e => onChange({ distanceUnit: e.target.value as 'meters' | 'yards' })}
            className={WIZARD_INPUT_CLS}
          >
            <option value="meters">Metres</option>
            <option value="yards">Yards</option>
          </select>
        </div>
      </div>

      {/* Location */}
      <div className="space-y-1.5">
        <label className={WIZARD_LABEL_CLS}>Location</label>
        <PlaceSelector
          locationId={values.savedLocationId}
          onLocationIdChange={id => onChange({ savedLocationId: id })}
          location={values.location}
          onLocationChange={loc => onChange({ location: loc })}
          onApplyDefaults={place => {
            const patch: Partial<WizardConditionsValues> = {}
            if (place.default_distance_m != null) {
              patch.distanceValue = String(place.default_distance_m)
              if (place.default_distance_unit === 'yards' || place.default_distance_unit === 'meters') {
                patch.distanceUnit = place.default_distance_unit
              }
            }
            if (Object.keys(patch).length > 0) onChange(patch)
          }}
          inputClassName={`${WIZARD_INPUT_CLS} placeholder:text-muted`}
        />
      </div>

      {/* Conditions */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className={WIZARD_LABEL_CLS}>Wind (mph)</label>
          <input
            type="number"
            step="0.1"
            value={values.windMph}
            onChange={e => onChange({ windMph: e.target.value })}
            placeholder="—"
            className={`${WIZARD_INPUT_CLS} font-mono`}
          />
        </div>
        <div className="space-y-1.5">
          <label className={WIZARD_LABEL_CLS}>Temp (°C)</label>
          <input
            type="number"
            step="0.1"
            value={values.tempCelsius}
            onChange={e => onChange({ tempCelsius: e.target.value })}
            placeholder="—"
            className={`${WIZARD_INPUT_CLS} font-mono`}
          />
        </div>
        <div className="space-y-1.5">
          <label className={WIZARD_LABEL_CLS}>Humidity (%)</label>
          <input
            type="number"
            step="1"
            value={values.humidityPct}
            onChange={e => onChange({ humidityPct: e.target.value })}
            placeholder="—"
            className={`${WIZARD_INPUT_CLS} font-mono`}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className={WIZARD_LABEL_CLS}>Notes</label>
        <textarea
          value={values.notes}
          onChange={e => onChange({ notes: e.target.value })}
          rows={3}
          placeholder="Conditions, observations…"
          className={`${WIZARD_INPUT_CLS} placeholder:text-muted resize-none`}
        />
      </div>

      {/* Chronograph */}
      <div className="rounded-lg border border-subtle bg-bg-2 p-4 space-y-2.5">
        <button
          type="button"
          onClick={() => setShowChrono(v => !v)}
          className={`${WIZARD_LABEL_CLS} flex items-center justify-between w-full`}
        >
          <span>Chronograph</span>
          {showChrono ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {showChrono && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="space-y-1.5">
              <label className={WIZARD_LABEL_CLS}>Vel. (fps)</label>
              <input
                type="number"
                step="0.1"
                value={values.velocityFps}
                onChange={e => onChange({ velocityFps: e.target.value })}
                placeholder="—"
                className={`${WIZARD_INPUT_CLS} font-mono`}
              />
            </div>
            <div className="space-y-1.5">
              <label className={WIZARD_LABEL_CLS}>SD</label>
              <input
                type="number"
                step="0.01"
                value={values.velocitySd}
                onChange={e => onChange({ velocitySd: e.target.value })}
                placeholder="—"
                className={`${WIZARD_INPUT_CLS} font-mono`}
              />
            </div>
            <div className="space-y-1.5">
              <label className={WIZARD_LABEL_CLS}>ES (fps)</label>
              <input
                type="number"
                step="0.1"
                value={values.extremeSpreadFps}
                onChange={e => onChange({ extremeSpreadFps: e.target.value })}
                placeholder="—"
                className={`${WIZARD_INPUT_CLS} font-mono`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Advanced */}
      <div className="rounded-lg border border-subtle bg-bg-2 p-4 space-y-2.5">
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className={`${WIZARD_LABEL_CLS} flex items-center justify-between w-full`}
        >
          <span>Advanced</span>
          {showAdvanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {showAdvanced && (
          <div className="space-y-2.5 pt-1">
            <div className="space-y-1.5">
              <label className={WIZARD_LABEL_CLS}>Bench / rest setup</label>
              <input
                type="text"
                value={values.benchSetup}
                onChange={e => onChange({ benchSetup: e.target.value })}
                placeholder="Front rest, rear bag…"
                className={`${WIZARD_INPUT_CLS} placeholder:text-muted`}
              />
            </div>
            <div className="space-y-1.5">
              <label className={WIZARD_LABEL_CLS}>Scope details</label>
              <input
                type="text"
                value={values.scopeDetails}
                onChange={e => onChange({ scopeDetails: e.target.value })}
                placeholder="MTC Viper Pro 10×44…"
                className={`${WIZARD_INPUT_CLS} placeholder:text-muted`}
              />
            </div>
            <div className="space-y-1.5">
              <label className={WIZARD_LABEL_CLS}>Pressure (mbar)</label>
              <input
                type="number"
                step="0.1"
                value={values.barometricPressure}
                onChange={e => onChange({ barometricPressure: e.target.value })}
                placeholder="—"
                className={`${WIZARD_INPUT_CLS} font-mono`}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
