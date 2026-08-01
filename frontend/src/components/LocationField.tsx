import { Suspense, lazy, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MapPin, Map as MapIcon } from 'lucide-react'

import { scoreCardApi } from '../api/scoreCards'
import { pelletTestApi } from '../api/pelletTesting'
import { useLocations } from '../api/locations'
import { toast } from '../store/toast'
import { requestPosition } from '../utils/geolocation'
import { isCoordinateLabel, resolveLocationLabel } from '../utils/geo'
import type { PickedLocation } from './MapLocationPicker'

const MapLocationPicker = lazy(() =>
  import('./MapLocationPicker').then((m) => ({ default: m.MapLocationPicker })),
)

export interface LocationValue {
  label: string
  lat?: number
  lng?: number
}

interface LocationFieldProps {
  value: LocationValue
  onChange: (next: LocationValue) => void
  recentLimit?: number
  showLabelInput?: boolean
  inputPlaceholder?: string
  inputClassName?: string
}

interface RecentLocation {
  label: string
  lat?: number
  lng?: number
}

export function LocationField({
  value,
  onChange,
  recentLimit = 4,
  showLabelInput = true,
  inputPlaceholder = 'Range / club',
  inputClassName,
}: LocationFieldProps) {
  const [locating, setLocating] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data: recentScore } = useQuery({
    queryKey: ['score-cards-recent'],
    queryFn: () => scoreCardApi.list(10, 0),
  })
  const { data: recentPellet } = useQuery({
    queryKey: ['pellet-tests-recent'],
    queryFn: () => pelletTestApi.list(10, 0),
  })
  const { data: places = [] } = useLocations()

  const recentLocations = useMemo<RecentLocation[]>(() => {
    const buckets = new Map<string, RecentLocation>()
    const visit = (loc?: string, lat?: number, lng?: number) => {
      if (!loc) return
      // A card shot at a saved place is listed under that place's name, even
      // when it was stored back when the label was still raw coordinates.
      const label = resolveLocationLabel(loc, lat, lng, places)
      if (!label || buckets.has(label)) return
      buckets.set(label, { label, lat, lng })
    }
    recentScore?.items.forEach((s) => visit(s.location, s.location_lat, s.location_lng))
    recentPellet?.items.forEach((s) => visit(s.location, s.location_lat, s.location_lng))
    return Array.from(buckets.values()).slice(0, recentLimit)
  }, [recentScore, recentPellet, recentLimit, places])

  function useMyLocation() {
    setLocating(true)
    requestPosition()
      .then(({ lat, lng }) => {
        onChange({ label: resolveLocationLabel(value.label, lat, lng, places), lat, lng })
      })
      .catch(() => toast("Couldn't get location — skip or type it in", 'error'))
      .finally(() => setLocating(false))
  }

  function pickRecent(r: RecentLocation) {
    if (value.label === r.label) {
      onChange({ label: '' })
    } else {
      onChange({ label: r.label, lat: r.lat, lng: r.lng })
    }
  }

  function handlePicked(loc: PickedLocation) {
    onChange({
      label: resolveLocationLabel(loc.label, loc.lat, loc.lng, places),
      lat: loc.lat,
      lng: loc.lng,
    })
    setPickerOpen(false)
  }

  const hasCoords = typeof value.lat === 'number' && typeof value.lng === 'number'

  return (
    <div className="space-y-3">
      {showLabelInput && (
        <input
          type="text"
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          placeholder={inputPlaceholder}
          aria-label={inputPlaceholder}
          className={
            inputClassName ??
            'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50'
          }
        />
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="px-4 py-2 rounded-full border border-subtle bg-surface text-sm tracking-wide hover:border-[var(--brass)]/40 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {locating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
          Use my location
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="px-4 py-2 rounded-full border border-subtle bg-surface text-sm tracking-wide hover:border-[var(--brass)]/40 transition-colors flex items-center gap-1.5"
        >
          <MapIcon size={14} />
          Pick on map
        </button>
        {recentLocations.map((loc) => {
          const active = value.label === loc.label
          return (
            <button
              key={loc.label}
              type="button"
              onClick={() => pickRecent(loc)}
              className={
                active
                  ? 'px-4 py-2 rounded-full border-2 border-[var(--brass)] bg-[var(--brass)]/10 text-sm tracking-wide'
                  : 'px-4 py-2 rounded-full border border-subtle bg-surface text-sm tracking-wide hover:border-[var(--brass)]/40 transition-colors'
              }
            >
              {loc.label}
            </button>
          )
        })}
      </div>

      {hasCoords && (
        <p className="text-xs text-muted">
          {value.label && !isCoordinateLabel(value.label) && <>{value.label} · </>}
          <span className="tabular-nums">{value.lat!.toFixed(3)}, {value.lng!.toFixed(3)}</span>
        </p>
      )}

      {pickerOpen && (
        <Suspense fallback={null}>
          <MapLocationPicker
            open={pickerOpen}
            initialLabel={value.label}
            initialLat={value.lat}
            initialLng={value.lng}
            onPick={handlePicked}
            onCancel={() => setPickerOpen(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
