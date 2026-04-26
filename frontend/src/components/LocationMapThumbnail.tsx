import { useEffect, useRef, useState } from 'react'
import { MapPin, Maximize2, X } from 'lucide-react'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface LocationMapThumbnailProps {
  label: string
  lat?: number | null
  lng?: number | null
  className?: string
}

const THUMB_ZOOM = 13
const EXPANDED_ZOOM = 15

function formatCoord(n: number) {
  return n.toFixed(5)
}

function MapPinOverlay({ large = false }: { large?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className={
          large
            ? 'rounded-full bg-[var(--brass)] text-black shadow-lg p-2'
            : 'rounded-full bg-[var(--brass)] text-black shadow-md p-1.5'
        }
      >
        <MapPin size={large ? 18 : 14} fill="currentColor" />
      </div>
    </div>
  )
}

export function LocationMapThumbnail({ label, lat, lng, className }: LocationMapThumbnailProps) {
  const hasCoords = typeof lat === 'number' && typeof lng === 'number'
  const [expanded, setExpanded] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!expanded) return
    returnFocusRef.current = document.activeElement as HTMLElement | null
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      returnFocusRef.current?.focus?.()
    }
  }, [expanded])

  if (!hasCoords) {
    return <span className={className}>{label}</span>
  }

  const center: [number, number] = [lat, lng]
  const coords = `${formatCoord(lat)}, ${formatCoord(lng)}`

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={
          className ??
          'group w-full overflow-hidden rounded-lg border border-subtle bg-surface text-left hover:border-[var(--brass)]/50 transition-colors'
        }
        aria-label={`Open map for ${label}`}
      >
        <div className="relative isolate h-32 bg-surface-hover">
          <MapContainer
            center={center}
            zoom={THUMB_ZOOM}
            scrollWheelZoom={false}
            dragging={false}
            doubleClickZoom={false}
            zoomControl={false}
            attributionControl={false}
            className="h-full w-full"
          >
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </MapContainer>
          <MapPinOverlay />
          <span className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white opacity-80 group-hover:opacity-100">
            <Maximize2 size={13} />
          </span>
        </div>
        <div className="flex items-start justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-sm text-secondary truncate">{label}</span>
            <span className="block text-[11px] text-muted font-mono tabular-nums">{coords}</span>
          </span>
          <MapPin size={15} className="mt-0.5 shrink-0 text-[var(--brass)]" />
        </div>
      </button>

      {expanded && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setExpanded(false)} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Map for ${label}`}
            className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-subtle bg-surface shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-secondary truncate">{label}</p>
                <p className="text-[11px] text-muted font-mono tabular-nums">{coords}</p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="shrink-0 text-muted hover:text-secondary transition-colors"
                aria-label="Close map"
              >
                <X size={18} />
              </button>
            </div>
            <div className="relative h-[70vh] max-h-[560px] min-h-[320px]">
              <MapContainer
                key={`${lat}:${lng}:expanded`}
                center={center}
                zoom={EXPANDED_ZOOM}
                scrollWheelZoom
                className="h-full w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </MapContainer>
              <MapPinOverlay large />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
