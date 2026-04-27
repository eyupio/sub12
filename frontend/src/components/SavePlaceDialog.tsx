import { useEffect, useState } from 'react'
import { Check, Loader2, MapPin, X } from 'lucide-react'
import {
  useCreateLocation,
  type CreateLocationInput,
  type Location,
} from '../api/locations'
import { TARGET_PRESETS } from '../config/targetPresets'
import { toast } from '../store/toast'

interface SavePlaceDialogProps {
  open: boolean
  initialName?: string
  initialAddress?: string
  initialLat?: number
  initialLng?: number
  initialDistanceM?: number
  initialDistanceUnit?: string
  onClose: () => void
  onSaved: (location: Location) => void
}

const inputCls =
  'w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/60'

export function SavePlaceDialog({
  open,
  initialName = '',
  initialAddress = '',
  initialLat,
  initialLng,
  initialDistanceM,
  initialDistanceUnit = 'meters',
  onClose,
  onSaved,
}: SavePlaceDialogProps) {
  const createMutation = useCreateLocation()

  const [name, setName] = useState(initialName)
  const [address, setAddress] = useState(initialAddress)
  const [defaultDistanceM, setDefaultDistanceM] = useState<string>(
    initialDistanceM != null ? String(initialDistanceM) : '',
  )
  const [defaultDistanceUnit, setDefaultDistanceUnit] = useState(initialDistanceUnit)
  const [defaultTargetPreset, setDefaultTargetPreset] = useState('')
  const [notes, setNotes] = useState('')

  // Re-seed inputs every time the dialog re-opens so the values reflect the
  // current form state, not whatever was in the dialog last time.
  useEffect(() => {
    if (!open) return
    setName(initialName)
    setAddress(initialAddress)
    setDefaultDistanceM(initialDistanceM != null ? String(initialDistanceM) : '')
    setDefaultDistanceUnit(initialDistanceUnit)
    setDefaultTargetPreset('')
    setNotes('')
  }, [open, initialName, initialAddress, initialDistanceM, initialDistanceUnit])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast('Name is required', 'error')
      return
    }
    const distanceParsed = defaultDistanceM.trim() === '' ? undefined : Number(defaultDistanceM)
    const payload: CreateLocationInput = {
      name: trimmedName,
      address: address.trim() || undefined,
      lat: initialLat,
      lng: initialLng,
      default_distance_m: Number.isFinite(distanceParsed) ? (distanceParsed as number) : undefined,
      default_distance_unit: defaultDistanceUnit,
      default_target_preset: defaultTargetPreset || undefined,
      notes: notes.trim() || undefined,
    }
    try {
      const created = await createMutation.mutateAsync(payload)
      toast('Place saved', 'success')
      onSaved(created)
      onClose()
    } catch {
      toast('Failed to save place', 'error')
    }
  }

  const hasCoords = typeof initialLat === 'number' && typeof initialLng === 'number'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-subtle rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-subtle">
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--brass)]" />
            Save as place
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-secondary transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <p className="text-xs text-muted">
            Saved places appear in the &quot;Saved location&quot; dropdown next time, with their defaults applied automatically.
          </p>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Name *</label>
            <input
              required
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
              placeholder="e.g. Home range"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Address</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className={inputCls}
              placeholder="Street, city…"
            />
          </div>

          {hasCoords && (
            <div className="rounded-lg border border-subtle bg-surface-hover px-3 py-2 text-xs text-secondary flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-[var(--brass)]" />
              Coordinates from form:{' '}
              <span className="font-mono tabular-nums">
                {initialLat!.toFixed(5)}, {initialLng!.toFixed(5)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Default distance</label>
              <input
                type="number"
                inputMode="decimal"
                value={defaultDistanceM}
                onChange={e => setDefaultDistanceM(e.target.value)}
                className={inputCls}
                placeholder="e.g. 25"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Unit</label>
              <select
                value={defaultDistanceUnit}
                onChange={e => setDefaultDistanceUnit(e.target.value)}
                className={inputCls}
              >
                <option value="meters">Metres</option>
                <option value="yards">Yards</option>
                <option value="feet">Feet</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Default target preset</label>
            <select
              value={defaultTargetPreset}
              onChange={e => setDefaultTargetPreset(e.target.value)}
              className={inputCls}
            >
              <option value="">None</option>
              {TARGET_PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-subtle rounded-lg text-sm text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 py-2 bg-[var(--brass)] text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check className="w-4 h-4" />}
              Save place
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
