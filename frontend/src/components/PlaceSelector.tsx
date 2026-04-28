import { useEffect, useState } from 'react'
import { LocateFixed, MapPin, MapPinned, Plus } from 'lucide-react'
import { useLocations, type Location } from '../api/locations'
import { LocationField, type LocationValue } from './LocationField'
import { SavePlaceDialog } from './SavePlaceDialog'
import { toast } from '../store/toast'
import { findNearbyPlace } from '../utils/geo'

interface PlaceSelectorProps {
  locationId: string | null
  onLocationIdChange: (id: string | null) => void
  location: LocationValue
  onLocationChange: (value: LocationValue) => void
  /**
   * Fired when a saved place is picked or freshly created so the parent can
   * apply the place's defaults (e.g. distance, distance unit).
   */
  onApplyDefaults?: (place: Location) => void
  inputClassName?: string
  selectClassName?: string
}

export function PlaceSelector({
  locationId,
  onLocationIdChange,
  location,
  onLocationChange,
  onApplyDefaults,
  inputClassName,
  selectClassName,
}: PlaceSelectorProps) {
  const { data: places = [] } = useLocations()
  const [saveOpen, setSaveOpen] = useState(false)

  const selectedPlace = locationId ? places.find(p => p.id === locationId) ?? null : null

  const applyPlace = (place: Location) => {
    onLocationIdChange(place.id)
    onLocationChange({
      label: place.name,
      lat: typeof place.lat === 'number' ? place.lat : undefined,
      lng: typeof place.lng === 'number' ? place.lng : undefined,
    })
    onApplyDefaults?.(place)
  }

  const handlePick = (id: string) => {
    if (!id) {
      // "No saved place" — drop the link but keep whatever the user already had
      // typed/coordinates so they aren't surprised by a wipe.
      onLocationIdChange(null)
      return
    }
    const place = places.find(p => p.id === id)
    if (place) applyPlace(place)
  }

  const handleFieldChange = (next: LocationValue) => {
    const match = findNearbyPlace(next.lat, next.lng, places)
    if (match) {
      applyPlace(match)
      return
    }
    // No nearby saved place — any manual edit (typing, geolocation, map pick,
    // recent chip) detaches from the saved place so we don't persist a label
    // that no longer matches the linked place.
    if (locationId) onLocationIdChange(null)
    onLocationChange(next)
  }

  const handleDetectForPicker = () => {
    if (!navigator.geolocation) {
      toast('Geolocation unavailable on this device', 'error')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const match = findNearbyPlace(pos.coords.latitude, pos.coords.longitude, places)
        if (match) {
          applyPlace(match)
          return
        }
        if (locationId) onLocationIdChange(null)
        onLocationChange({
          label: location.label,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      },
      () => toast("Couldn't get location — skip or type it in", 'error'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    )
  }

  // Resolve incoming coords against saved places — covers loading an existing
  // score card whose coords sit near a saved place but aren't linked, or
  // parents pushing coords in from elsewhere.
  useEffect(() => {
    if (locationId) return
    if (typeof location.lat !== 'number' || typeof location.lng !== 'number') return
    if (places.length === 0) return
    const match = findNearbyPlace(location.lat, location.lng, places)
    if (match) onLocationIdChange(match.id)
  }, [location.lat, location.lng, locationId, places, onLocationIdChange])

  const hasCoords = typeof location.lat === 'number' && typeof location.lng === 'number'
  const hasLabel = location.label.trim().length > 0
  const showSaveLink = !locationId && (hasLabel || hasCoords)
  const showOverrideHint = !locationId && places.length > 0 && (hasLabel || hasCoords)

  const baseSelectCls =
    selectClassName ??
    'w-full pl-9 pr-3 py-2 border border-subtle rounded bg-surface text-primary text-sm focus:outline-none focus:border-[var(--brass)]/50'

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <select
            value={locationId ?? ''}
            onChange={e => handlePick(e.target.value)}
            className={baseSelectCls}
            aria-label="Saved place"
          >
            <option value="">
              {places.length === 0 ? 'No saved places yet' : 'Pick a saved place…'}
            </option>
            {places.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleDetectForPicker}
          title="Detect my location"
          aria-label="Detect my location"
          className="flex items-center justify-center px-3 py-2 text-sm border border-subtle rounded bg-surface text-secondary hover:border-[var(--brass)]/40 transition-colors"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>

      {selectedPlace && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--brass)]/30 bg-[var(--brass)]/5 px-3 py-2 text-xs">
          <MapPinned className="w-3.5 h-3.5 text-[var(--brass)] shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-medium text-primary truncate">{selectedPlace.name}</p>
            {selectedPlace.address && (
              <p className="text-secondary truncate">{selectedPlace.address}</p>
            )}
            {typeof selectedPlace.lat === 'number' && typeof selectedPlace.lng === 'number' && (
              <p className="text-muted font-mono tabular-nums">
                {selectedPlace.lat.toFixed(3)}, {selectedPlace.lng.toFixed(3)}
              </p>
            )}
          </div>
        </div>
      )}

      <LocationField
        value={location}
        onChange={handleFieldChange}
        inputClassName={inputClassName}
      />

      {showOverrideHint && (
        <p className="text-[11px] text-muted italic">
          Custom location — not linked to a saved place.
        </p>
      )}

      {showSaveLink && (
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] tracking-wide text-[var(--brass)] hover:underline"
        >
          <Plus className="w-3 h-3" /> Save this as a new place
        </button>
      )}

      <SavePlaceDialog
        open={saveOpen}
        initialName={location.label.trim()}
        initialAddress={location.label.trim()}
        initialLat={location.lat}
        initialLng={location.lng}
        onClose={() => setSaveOpen(false)}
        onSaved={created => applyPlace(created)}
      />
    </div>
  )
}
