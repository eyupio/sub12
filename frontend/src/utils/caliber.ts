export const CALIBER_MAP: Record<string, number> = {
  '.177': 4.5,
  '.20': 5.08,
  '.22': 5.5,
  '.25': 6.35,
}

export function pelletDiameterMM(caliber: string | undefined | null): number {
  if (!caliber) return CALIBER_MAP['.22']
  const hit = CALIBER_MAP[caliber]
  if (hit !== undefined) return hit
  const parsed = Number(caliber)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : CALIBER_MAP['.22']
}
