import { describe, it, expect } from 'vitest'
import { findNearbyPlace, isCoordinateLabel, metersBetween, resolveLocationLabel } from '../geo'

describe('metersBetween', () => {
  it('returns 0 for identical points', () => {
    expect(metersBetween(53.862, -1.957, 53.862, -1.957)).toBe(0)
  })

  it('matches the screenshot case (~66 m for 0.001° lng at lat 53.86)', () => {
    const d = metersBetween(53.862, -1.957, 53.862, -1.958)
    expect(d).toBeGreaterThan(60)
    expect(d).toBeLessThan(80)
  })

  it('measures kilometre-scale gaps', () => {
    const d = metersBetween(53.862, -1.957, 53.872, -1.957)
    expect(d).toBeGreaterThan(1000)
    expect(d).toBeLessThan(1200)
  })
})

describe('findNearbyPlace', () => {
  const places = [
    { id: 'home', lat: 53.862, lng: -1.957 },
    { id: 'far', lat: 51.5, lng: -0.12 },
    { id: 'no-coords', lat: undefined, lng: undefined },
  ]

  it('matches a place 66 m away within the default 150 m threshold', () => {
    const match = findNearbyPlace(53.862, -1.958, places)
    expect(match?.id).toBe('home')
  })

  it('returns null when nothing is within threshold', () => {
    expect(findNearbyPlace(40, 40, places)).toBeNull()
  })

  it('returns null when input coords are missing', () => {
    expect(findNearbyPlace(undefined, -1.958, places)).toBeNull()
    expect(findNearbyPlace(53.862, undefined, places)).toBeNull()
  })

  it('skips places without coordinates', () => {
    const onlyMissing = [{ id: 'x', lat: undefined, lng: undefined }]
    expect(findNearbyPlace(53.862, -1.957, onlyMissing)).toBeNull()
  })

  it('respects a custom threshold', () => {
    expect(findNearbyPlace(53.862, -1.958, places, 50)).toBeNull()
    expect(findNearbyPlace(53.862, -1.958, places, 100)?.id).toBe('home')
  })

  it('picks the closest place when several are nearby', () => {
    const nearby = [
      { id: 'a', lat: 53.8625, lng: -1.957 },
      { id: 'b', lat: 53.862, lng: -1.957 },
    ]
    expect(findNearbyPlace(53.862, -1.957, nearby)?.id).toBe('b')
  })
})

describe('isCoordinateLabel', () => {
  it('recognises the coordinate fallback the pickers write', () => {
    expect(isCoordinateLabel('53.862, -1.957')).toBe(true)
    expect(isCoordinateLabel('53.86200, -1.95700')).toBe(true)
    expect(isCoordinateLabel(' 51.5,-0.12 ')).toBe(true)
  })

  it('leaves real names alone', () => {
    expect(isCoordinateLabel('Bisley')).toBe(false)
    expect(isCoordinateLabel('Range 25, Bay 3')).toBe(false)
    expect(isCoordinateLabel('')).toBe(false)
    expect(isCoordinateLabel(undefined)).toBe(false)
  })
})

describe('resolveLocationLabel', () => {
  const places = [{ id: 'home', name: 'Ilkley Range', lat: 53.862, lng: -1.957 }]

  it('prefers the saved place name over a typed label', () => {
    expect(resolveLocationLabel('somewhere else', 53.862, -1.9575, places)).toBe('Ilkley Range')
  })

  it('replaces a coordinate label with the saved place name', () => {
    expect(resolveLocationLabel('53.862, -1.957', 53.862, -1.957, places)).toBe('Ilkley Range')
  })

  it('keeps a typed label when no saved place is nearby', () => {
    expect(resolveLocationLabel('Bisley', 51.31, -0.62, places)).toBe('Bisley')
  })

  it('falls back to coordinates only when there is no name at all', () => {
    expect(resolveLocationLabel('', 51.31, -0.62, places)).toBe('51.310, -0.620')
    expect(resolveLocationLabel('51.31000, -0.62000', 51.31, -0.62, places)).toBe('51.310, -0.620')
  })

  it('returns the typed label unchanged when there are no coordinates', () => {
    expect(resolveLocationLabel('Bisley', undefined, undefined, places)).toBe('Bisley')
    expect(resolveLocationLabel(undefined, undefined, undefined, places)).toBe('')
  })
})
