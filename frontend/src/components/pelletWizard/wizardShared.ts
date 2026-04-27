import type { LocationValue } from '../LocationField'

export const WIZARD_INPUT_CLS =
  'w-full bg-surface border border-subtle rounded px-3 py-2 text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50'

export const WIZARD_LABEL_CLS = 't-section-title'

export interface WizardEquipmentValues {
  rifleId: string
  pelletId: string
  testDate: string
}

export interface WizardConditionsValues {
  distanceValue: string
  distanceUnit: 'meters' | 'yards'
  savedLocationId: string | null
  location: LocationValue
  windMph: string
  tempCelsius: string
  humidityPct: string
  notes: string
  velocityFps: string
  velocitySd: string
  extremeSpreadFps: string
  benchSetup: string
  scopeDetails: string
  barometricPressure: string
}

export function distanceToMeters(value: number, unit: 'meters' | 'yards'): number {
  return unit === 'yards' ? value * 0.9144 : value
}

export function calcMOA(groupSizeMM: number, distanceM: number): number {
  if (distanceM <= 0) return 0
  return (groupSizeMM / (distanceM * 1000)) * (180 / Math.PI) * 60
}
