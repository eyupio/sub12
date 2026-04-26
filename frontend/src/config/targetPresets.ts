// NSRA air rifle target ring specifications
// Based on ISSF/NSRA 10m Air Rifle Target (used at 6 yards for benchrest)
// Diameters are outer edge of scoring ring in mm

export interface TargetRing {
  name: string
  diameter_mm: number
}

export interface TargetPreset {
  id: string
  name: string
  description: string
  rings?: TargetRing[]
  width_mm?: number
  height_mm?: number
}

export const CUSTOM_PRESET_ID = 'custom'

export const TARGET_PRESETS: TargetPreset[] = [
  {
    id: 'nsra-air-rifle',
    name: 'NSRA Air Rifle (6yd)',
    description: 'Standard NSRA 5-bull benchrest card — 6 yard target',
    rings: [
      { name: 'Inner 10', diameter_mm: 0.5 },
      { name: '10 ring', diameter_mm: 1.0 },
      { name: '9 ring', diameter_mm: 5.0 },
      { name: '8 ring', diameter_mm: 9.0 },
      { name: '7 ring', diameter_mm: 13.0 },
      { name: '6 ring', diameter_mm: 17.0 },
      { name: '5 ring', diameter_mm: 21.0 },
      { name: '4 ring', diameter_mm: 25.0 },
      { name: '3 ring', diameter_mm: 29.0 },
    ],
  },
  {
    id: 'nsra-10m',
    name: 'NSRA 10m Air Rifle',
    description: 'ISSF 10m air rifle target — competition standard',
    rings: [
      { name: 'Inner 10', diameter_mm: 0.5 },
      { name: '10 ring', diameter_mm: 5.0 },
      { name: '9 ring', diameter_mm: 10.0 },
      { name: '8 ring', diameter_mm: 15.0 },
      { name: '7 ring', diameter_mm: 20.0 },
      { name: '6 ring', diameter_mm: 25.0 },
      { name: '5 ring', diameter_mm: 30.0 },
      { name: '4 ring', diameter_mm: 35.0 },
      { name: '3 ring', diameter_mm: 40.0 },
      { name: '2 ring', diameter_mm: 45.0 },
    ],
  },
  {
    id: 'plate-14',
    name: '14 × 14 cm plate',
    description: 'Plain square plate, 140 × 140 mm',
    width_mm: 140,
    height_mm: 140,
  },
  {
    id: 'plate-17',
    name: '17 × 17 cm plate',
    description: 'Plain square plate, 170 × 170 mm',
    width_mm: 170,
    height_mm: 170,
  },
  {
    id: 'paper-a4',
    name: 'A4 paper',
    description: '210 × 297 mm sheet',
    width_mm: 210,
    height_mm: 297,
  },
  {
    id: 'paper-a3',
    name: 'A3 paper',
    description: '297 × 420 mm sheet',
    width_mm: 297,
    height_mm: 420,
  },
]

export function getPresetById(id: string): TargetPreset | undefined {
  return TARGET_PRESETS.find((p) => p.id === id)
}
