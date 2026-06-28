import { useEffect, useRef, useState } from 'react'
import { Crosshair, Loader2, MapPin, X } from 'lucide-react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { toast } from '../store/toast'
import { requestPosition } from '../utils/geolocation'

export interface PickedLocation {
  label: string
  lat: number
  lng: number
}

interface MapLocationPickerProps {
  open: boolean
  initialLabel?: string
  initialLat?: number
  initialLng?: number
  onPick: (loc: PickedLocation) => void
  onCancel: () => void
}

const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278]
const DEFAULT_ZOOM = 13
const FOCUSED_ZOOM = 15

function formatCoord(n: number) {
  return n.toFixed(5)
}

function CenterTracker({ onCenter }: { onCenter: (lat: number, lng: number) => void }) {
  const map = useMap()
  useEffect(() => {
    function handle() {
      const c = map.getCenter()
      onCenter(c.lat, c.lng)
    }
    map.on('moveend', handle)
    handle()
    return () => {
      map.off('moveend', handle)
    }
  }, [map, onCenter])
  return null
}

function MapHandle({ onReady }: { onReady: (m: LeafletMap) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export function MapLocationPicker({
  open,
  initialLabel,
  initialLat,
  initialLng,
  onPick,
  onCancel,
}: MapLocationPickerProps) {
  const hasInitialCoords = typeof initialLat === 'number' && typeof initialLng === 'number'
  const start: [number, number] = hasInitialCoords ? [initialLat!, initialLng!] : DEFAULT_CENTER
  const [center, setCenter] = useState<[number, number]>(start)
  const [label, setLabel] = useState(initialLabel ?? '')
  const [locating, setLocating] = useState(false)
  const mapRef = useRef<LeafletMap | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    setCenter(hasInitialCoords ? [initialLat!, initialLng!] : DEFAULT_CENTER)
    setLabel(initialLabel ?? '')
    returnFocusRef.current = document.activeElement as HTMLElement | null
    return () => {
      returnFocusRef.current?.focus?.()
    }
    // initialLabel/initialLat/initialLng captured only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  function useMyLocation() {
    setLocating(true)
    requestPosition()
      .then(({ lat, lng }) => {
        const next: [number, number] = [lat, lng]
        setCenter(next)
        mapRef.current?.setView(next, FOCUSED_ZOOM)
      })
      .catch(() => toast("Couldn't get location — pan the map instead", 'error'))
      .finally(() => setLocating(false))
  }

  function handleSave() {
    const currentCenter = mapRef.current?.getCenter()
    const lat = currentCenter?.lat ?? center[0]
    const lng = currentCenter?.lng ?? center[1]
    const trimmed = label.trim()
    onPick({
      label: trimmed.length > 0 ? trimmed : `${formatCoord(lat)}, ${formatCoord(lng)}`,
      lat,
      lng,
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative bg-surface border border-subtle rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Pick location on map"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <h3 className="t-subsection-title flex items-center gap-2">
            <MapPin size={14} /> Pick location on map
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-muted hover:text-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative" style={{ height: 360 }}>
          <MapContainer
            center={start}
            zoom={hasInitialCoords ? FOCUSED_ZOOM : DEFAULT_ZOOM}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CenterTracker onCenter={(lat, lng) => setCenter([lat, lng])} />
            <MapHandle onReady={(m) => { mapRef.current = m }} />
            <ClickPicker
              onPick={(lat, lng) => {
                const next: [number, number] = [lat, lng]
                setCenter(next)
                mapRef.current?.setView(next, FOCUSED_ZOOM)
              }}
            />
          </MapContainer>
          {/* Fixed crosshair at the center of the map; selection = whatever the
              center sits over after a pan. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <Crosshair size={32} className="text-[var(--brass)] drop-shadow" />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-subtle space-y-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Center: <span className="text-secondary tabular-nums">{formatCoord(center[0])}, {formatCoord(center[1])}</span>
            </span>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="px-3 py-1.5 rounded border border-subtle bg-surface text-xs hover:border-[var(--brass)]/40 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {locating ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
              Use my location
            </button>
          </div>
          <div>
            <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Range / club name"
              className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded border border-subtle text-sm text-muted hover:text-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded bg-[var(--brass)] text-black text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
