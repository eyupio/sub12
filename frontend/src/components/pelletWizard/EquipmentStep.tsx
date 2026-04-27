import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gearApi, type CreatePelletPayload } from '../../api/gear'
import { toast } from '../../store/toast'
import { WIZARD_INPUT_CLS, WIZARD_LABEL_CLS, type WizardEquipmentValues } from './wizardShared'

interface Props {
  values: WizardEquipmentValues
  onChange: (patch: Partial<WizardEquipmentValues>) => void
}

export function EquipmentStep({ values, onChange }: Props) {
  const qc = useQueryClient()
  const { data: rifleData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: pelletData } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const rifles = rifleData?.items ?? []
  const pellets = pelletData?.items ?? []

  const [showAddPellet, setShowAddPellet] = useState(false)
  const [newPellet, setNewPellet] = useState<CreatePelletPayload>({ brand: '', model: '' })

  const addPelletMutation = useMutation({
    mutationFn: () => gearApi.createPellet(newPellet),
    onSuccess: (pellet) => {
      qc.invalidateQueries({ queryKey: ['pellets'] })
      onChange({ pelletId: pellet.id })
      setShowAddPellet(false)
      setNewPellet({ brand: '', model: '' })
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to add pellet', 'error'),
  })

  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-5">
      <header>
        <h2 className="t-subsection-title">Equipment</h2>
        <p className="text-sm text-muted mt-0.5">Pick the rifle, pellet, and date for this session.</p>
      </header>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className={WIZARD_LABEL_CLS}>Rifle</label>
          {rifles.length > 0 ? (
            <select
              value={values.rifleId}
              onChange={e => onChange({ rifleId: e.target.value })}
              className={WIZARD_INPUT_CLS}
            >
              <option value="">Select rifle…</option>
              {rifles.map(r => (
                <option key={r.id} value={r.id}>
                  {r.make} {r.model} ({r.calibre})
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted py-1">
              No rifles yet —{' '}
              <Link to="/gear" className="text-[var(--brass)] hover:opacity-80">
                add one in Gear
              </Link>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className={WIZARD_LABEL_CLS}>Pellet</label>
          <select
            value={values.pelletId}
            onChange={e => {
              if (e.target.value === '__add__') {
                setShowAddPellet(true)
                onChange({ pelletId: '' })
              } else {
                onChange({ pelletId: e.target.value })
                setShowAddPellet(false)
              }
            }}
            className={WIZARD_INPUT_CLS}
          >
            <option value="">Select pellet…</option>
            {pellets.map(p => (
              <option key={p.id} value={p.id}>
                {p.brand} {p.model}
                {p.head_size_mm ? ` ${p.head_size_mm}mm` : ''}
              </option>
            ))}
            <option value="__add__">+ Add new pellet…</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={WIZARD_LABEL_CLS}>Test date</label>
          <input
            type="date"
            value={values.testDate}
            onChange={e => onChange({ testDate: e.target.value })}
            className={`${WIZARD_INPUT_CLS} font-mono`}
          />
        </div>
      </div>

      {showAddPellet && (
        <div className="space-y-3 p-4 rounded-lg border border-subtle bg-bg-2">
          <h3 className="text-xs uppercase tracking-widest text-muted">Add a new pellet</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={WIZARD_LABEL_CLS}>Brand</label>
              <input
                className={WIZARD_INPUT_CLS}
                placeholder="JSB"
                value={newPellet.brand}
                onChange={e => setNewPellet(p => ({ ...p, brand: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className={WIZARD_LABEL_CLS}>Model</label>
              <input
                className={WIZARD_INPUT_CLS}
                placeholder="Match Exact"
                value={newPellet.model}
                onChange={e => setNewPellet(p => ({ ...p, model: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className={WIZARD_LABEL_CLS}>Head size (mm)</label>
              <input
                className={WIZARD_INPUT_CLS}
                type="number"
                step="0.01"
                placeholder="4.51"
                onChange={e =>
                  setNewPellet(p => ({
                    ...p,
                    head_size_mm: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className={WIZARD_LABEL_CLS}>Weight (gr)</label>
              <input
                className={WIZARD_INPUT_CLS}
                type="number"
                step="0.01"
                placeholder="8.44"
                onChange={e =>
                  setNewPellet(p => ({
                    ...p,
                    weight_grains: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
          </div>
          {addPelletMutation.isError && (
            <p className="text-[var(--error-text)] text-xs">Failed to add pellet.</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => addPelletMutation.mutate()}
              disabled={addPelletMutation.isPending || !newPellet.brand || !newPellet.model}
              className="flex-1 py-2 rounded bg-gold text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addPelletMutation.isPending ? 'Saving…' : 'Add Pellet'}
            </button>
            <button
              onClick={() => setShowAddPellet(false)}
              className="px-4 py-2 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
