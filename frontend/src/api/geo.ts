import { useQuery, type QueryClient } from '@tanstack/react-query'

import { api } from './client'
import { coordsForLabel, isCoordinateLabel, resolveLocationLabel } from '../utils/geo'

export interface ReverseGeocode {
  name: string
  address?: string
}

export const geoApi = {
  // 204 (nowhere named here, or no geocoder configured) resolves to undefined.
  reverse: (lat: number, lng: number) =>
    api.get<ReverseGeocode | undefined>(`/geo/reverse?lat=${lat}&lng=${lng}`),
}

// Coordinates are rounded before they become a query key so a few metres of
// GPS jitter — or two shooters on the same firing point — share one lookup.
// The backend caches on the same rounding.
const round3 = (n: number) => Math.round(n * 1000) / 1000

export function reverseGeocodeQuery(lat: number, lng: number) {
  const rLat = round3(lat)
  const rLng = round3(lng)
  return {
    queryKey: ['geo-reverse', rLat, rLng] as const,
    // A place name never goes stale, and a failed lookup must not stop the
    // caller — it just means we keep showing coordinates.
    queryFn: () => geoApi.reverse(rLat, rLng).then(r => r ?? null).catch(() => null),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  }
}

/**
 * The name for a point the user just picked. A saved place wins, then anything
 * they typed, then the geocoder's name for the spot, and only then the raw
 * coordinates — so a card is labelled "Otley Sports Ground" rather than
 * "53.862, -1.958" even when the user has saved no places at all.
 */
export async function nameForPick<
  T extends { name: string; lat?: number | null; lng?: number | null },
>(
  qc: QueryClient,
  label: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
  places: T[],
): Promise<string> {
  const known = resolveLocationLabel(label, lat, lng, places)
  if (!isCoordinateLabel(known)) return known
  // A label that is itself a grid reference stands in for the coordinates when
  // none were passed, so a point picked from stored text is still named.
  const coords = coordsForLabel(label, lat, lng)
  if (!coords) return known
  const found = await qc.fetchQuery(reverseGeocodeQuery(coords.lat, coords.lng))
  return found?.name || known
}

export function useReverseGeocode(
  lat: number | undefined,
  lng: number | undefined,
  enabled = true,
) {
  const hasCoords = typeof lat === 'number' && typeof lng === 'number'
  return useQuery({
    ...reverseGeocodeQuery(hasCoords ? lat : 0, hasCoords ? lng : 0),
    enabled: enabled && hasCoords,
  })
}
