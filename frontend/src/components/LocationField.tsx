import { Suspense, lazy, useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MapPin, Map as MapIcon } from 'lucide-react'

import { scoreCardApi } from '../api/scoreCards'
import { pelletTestApi } from '../api/pelletTesting'
import { useLocations } from '../api/locations'
import { nameForPick, reverseGeocodeQuery } from '../api/geo'
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
  const qc = useQueryClient()

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

  // Cards stored before the user named anywhere still carry a "53.862, -1.958"
  // label. Ask the geocoder what that point is called so the chip offers a
  // place rather than a grid reference.
  const unnamedRecents = useMemo(
    () =>
      recentLocations.filter(
        (r) =>
          isCoordinateLabel(r.label) && typeof r.lat === 'number' && typeof r.lng === 'number',
      ),
    [recentLocations],
  )
  const geocodedRecents = useQueries({
    queries: unnamedRecents.map((r) => reverseGeocodeQuery(r.lat!, r.lng!)),
  })
  const namedRecents = useMemo<RecentLocation[]>(() => {
    const names = new Map<string, string>()
    unnamedRecents.forEach((r, i) => {
      const name = geocodedRecents[i]?.data?.name
      if (name) names.set(r.label, name)
    })
    const seen = new Set<string>()
    const out: RecentLocation[] = []
    for (const r of recentLocations) {
      const label = names.get(r.label) ?? r.label
      // Two coordinate labels can name the same place once resolved.
      if (seen.has(label)) continue
      seen.add(label)
      out.push({ ...r, label })
    }
    return out
    // geocodedRecents is a fresh array each render; the memo only saves work.
  }, [recentLocations, unnamedRecents, geocodedRecents])

  function useMyLocation() {
    setLocating(true)
    requestPosition()
      .then(({ lat, lng }) =>
        nameForPick(qc, value.label, lat, lng, places).then((label) =>
          onChange({ label, lat, lng }),
        ),
      )
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
    setPickerOpen(false)
    onChange({
      label: resolveLocationLabel(loc.label, loc.lat, loc.lng, places),
      lat: loc.lat,
      lng: loc.lng,
    })
    // The picker has usually already resolved a name, so this is a cache hit;
    // it only changes anything when the pick came back as bare coordinates.
    void nameForPick(qc, loc.label, loc.lat, loc.lng, places).then((label) =>
      onChange({ label, lat: loc.lat, lng: loc.lng }),
    )
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
        {namedRecents.map((loc) => {
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
