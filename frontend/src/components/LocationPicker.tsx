import { useState } from 'react'
import { MapPin, LocateFixed, Loader2 } from 'lucide-react'
import { useLocations, type Location } from '../api/locations'
import { requestPosition } from '../utils/geolocation'
import { toast } from '../store/toast'

interface LocationPickerProps {
  value: string | null
  onChange: (id: string | null) => void
  onApplyDefaults?: (location: Location | null, lat?: number, lng?: number) => void
  className?: string
}

export function LocationPicker({ value, onChange, onApplyDefaults, className = '' }: LocationPickerProps) {
  const { data: locations = [] } = useLocations()
  const [detecting, setDetecting] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null
    onChange(id)
    if (onApplyDefaults) {
      const loc = locations.find(l => l.id === id) ?? null
      onApplyDefaults(loc)
    }
  }

  const handleDetect = () => {
    setDetecting(true)
    requestPosition()
      .then(({ lat, lng }) => {
        if (onApplyDefaults) onApplyDefaults(null, lat, lng)
      })
      .catch(() => toast("Couldn't get location — pick one from the list", 'error'))
      .finally(() => setDetecting(false))
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      <div className="relative flex-1">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        <select
          value={value ?? ''}
          onChange={handleChange}
          className="w-full pl-9 pr-3 py-2 border border-subtle rounded-lg bg-surface text-primary text-sm focus:border-[var(--brass)]/50 focus:outline-none"
        >
          <option value="">No saved location</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      </div>
      {onApplyDefaults && (
        <button
          type="button"
          onClick={handleDetect}
          disabled={detecting}
          title="Detect my location"
          aria-label="Detect my location"
          className="flex items-center gap-1 px-3 py-2 text-sm border border-subtle rounded-lg bg-surface text-secondary hover:bg-surface-hover hover:border-[var(--brass)]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
        </button>
      )}
    </div>
  )
}
