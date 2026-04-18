import { describe, it, expect } from 'vitest'

import {
  metersToYards,
  mmToMOA,
  mmToMRAD,
  normalizeGroupToDistance,
  yardsToMeters,
} from '../ballistics'

describe('normalizeGroupToDistance', () => {
  it('scales linearly by the distance ratio', () => {
    // A 10mm group at 25m projects to 20mm at 50m.
    expect(normalizeGroupToDistance(10, 25, 50)).toBeCloseTo(20, 6)
  })

  it('returns the input unchanged when distances match', () => {
    expect(normalizeGroupToDistance(15, 50, 50)).toBe(15)
  })

  it('halves the size when normalizing from 50m to 25m', () => {
    expect(normalizeGroupToDistance(20, 50, 25)).toBeCloseTo(10, 6)
  })

  it('returns the input when the actual distance is zero (guards divide-by-zero)', () => {
    expect(normalizeGroupToDistance(12, 0, 50)).toBe(12)
  })

  it('returns the input when the actual distance is negative', () => {
    expect(normalizeGroupToDistance(12, -10, 50)).toBe(12)
  })

  it('returns the input when the target distance is zero', () => {
    expect(normalizeGroupToDistance(12, 50, 0)).toBe(12)
  })
})

describe('mmToMOA', () => {
  it('1.047 inches at 100 yards = 1 true MOA', () => {
    // True MOA (angular): 1 MOA at 100 yards = 1.047 inches = 26.5938 mm.
    const moa = mmToMOA(26.5938, 91.44)
    expect(moa).toBeCloseTo(1, 2)
  })

  it('1 inch at 100 yards is ~0.955 true MOA (shooter-MOA vs true-MOA distinction)', () => {
    expect(mmToMOA(25.4, 91.44)).toBeCloseTo(0.9549, 3)
  })

  it('doubles when size doubles at fixed distance', () => {
    const a = mmToMOA(10, 50)
    const b = mmToMOA(20, 50)
    expect(b / a).toBeCloseTo(2, 6)
  })

  it('halves when distance doubles at fixed size', () => {
    const a = mmToMOA(10, 25)
    const b = mmToMOA(10, 50)
    expect(b / a).toBeCloseTo(0.5, 6)
  })

  it('returns 0 for non-positive distance', () => {
    expect(mmToMOA(10, 0)).toBe(0)
    expect(mmToMOA(10, -5)).toBe(0)
  })

  it('returns 0 for zero size', () => {
    expect(mmToMOA(0, 100)).toBe(0)
  })
})

describe('mmToMRAD', () => {
  it('size/distance in consistent units equals mrad', () => {
    // 10mm at 10m = 10/10 = 1 mrad.
    expect(mmToMRAD(10, 10)).toBeCloseTo(1, 6)
  })

  it('1 MRAD at 100m corresponds to 100mm', () => {
    expect(mmToMRAD(100, 100)).toBeCloseTo(1, 6)
  })

  it('returns 0 for non-positive distance', () => {
    expect(mmToMRAD(10, 0)).toBe(0)
    expect(mmToMRAD(10, -1)).toBe(0)
  })
})

describe('yardsToMeters / metersToYards', () => {
  it('1 yard = 0.9144 meters (exact)', () => {
    expect(yardsToMeters(1)).toBeCloseTo(0.9144, 6)
  })

  it('100 yards = 91.44 meters', () => {
    expect(yardsToMeters(100)).toBeCloseTo(91.44, 6)
  })

  it('round-trips: yards → meters → yards', () => {
    expect(metersToYards(yardsToMeters(50))).toBeCloseTo(50, 6)
  })

  it('round-trips: meters → yards → meters', () => {
    expect(yardsToMeters(metersToYards(25))).toBeCloseTo(25, 6)
  })

  it('handles zero', () => {
    expect(yardsToMeters(0)).toBe(0)
    expect(metersToYards(0)).toBe(0)
  })
})
