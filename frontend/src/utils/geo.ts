const EARTH_RADIUS_M = 6_371_000

export function metersBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const NEARBY_PLACE_THRESHOLD_M = 150

export function findNearbyPlace<
  T extends { lat?: number | null; lng?: number | null },
>(
  lat: number | undefined,
  lng: number | undefined,
  places: T[],
  thresholdMeters: number = NEARBY_PLACE_THRESHOLD_M,
): T | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  let best: T | null = null
  let bestDist = Infinity
  for (const place of places) {
    if (typeof place.lat !== 'number' || typeof place.lng !== 'number') continue
    const d = metersBetween(lat, lng, place.lat, place.lng)
    if (d <= thresholdMeters && d < bestDist) {
      best = place
      bestDist = d
    }
  }
  return best
}

// The "51.500, -0.120" string the pickers fall back to when nothing better is
// known. Recognising it lets a saved place's name take over a label that only
// ever held coordinates.
const COORD_LABEL_RE = /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/

export function isCoordinateLabel(label: string | undefined | null): boolean {
  return typeof label === 'string' && COORD_LABEL_RE.test(label.trim())
}

/**
 * The point a coordinate label stands for, or null if it isn't one. Rows
 * stored before we kept lat/lng — or by a picker that only wrote the label —
 * still carry the coordinates in the text, to three decimals (~110m). That is
 * inside the radius within which we'd call two points the same place anyway,
 * so it is enough to match a saved place or to ask the geocoder.
 */
export function parseCoordLabel(
  label: string | undefined | null,
): { lat: number; lng: number } | null {
  const match = COORD_LABEL_RE.exec(typeof label === 'string' ? label.trim() : '')
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/** Stored coordinates when we have them, else whatever the label spells out. */
export function coordsForLabel(
  label: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
): { lat: number; lng: number } | null {
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
  return parseCoordLabel(label)
}

export function formatCoordLabel(lat: number, lng: number): string {
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`
}

/**
 * The label to show for a picked point. A saved place's name always wins so a
 * location the user has named never renders as coordinates; failing that a
 * label the user typed is kept, and coordinates are the last resort.
 */
export function resolveLocationLabel<
  T extends { name: string; lat?: number | null; lng?: number | null },
>(
  label: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
  places: T[],
): string {
  const coords = coordsForLabel(label, lat, lng)
  const nearby = findNearbyPlace(coords?.lat, coords?.lng, places)
  if (nearby) return nearby.name
  const trimmed = label?.trim() ?? ''
  if (trimmed && !isCoordinateLabel(trimmed)) return trimmed
  if (coords) return formatCoordLabel(coords.lat, coords.lng)
  return trimmed
}
