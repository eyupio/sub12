import { describe, it, expect } from 'vitest'

import {
  computeGroupSize,
  detectHoles,
  type DetectedHole,
} from '../holeDetection'

function makeImage(width: number, height: number, fill = 255): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill
    data[i * 4 + 1] = fill
    data[i * 4 + 2] = fill
    data[i * 4 + 3] = 255
  }
  // jsdom may not expose ImageData in all versions — construct a plain
  // shape that matches the structural interface detectHoles() relies on.
  return { width, height, data } as unknown as ImageData
}

function fillRect(
  img: ImageData,
  x0: number,
  y0: number,
  w: number,
  h: number,
  gray: number,
) {
  const data = img.data as unknown as Uint8ClampedArray
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const idx = (y * img.width + x) * 4
      data[idx] = gray
      data[idx + 1] = gray
      data[idx + 2] = gray
      data[idx + 3] = 255
    }
  }
}

describe('computeGroupSize', () => {
  it('returns null when fewer than 2 holes', () => {
    expect(computeGroupSize([], 10)).toBeNull()
    expect(
      computeGroupSize([{ centerX: 0, centerY: 0 } as DetectedHole], 10),
    ).toBeNull()
  })

  it('returns null when pixelsPerMM is non-positive', () => {
    const holes: DetectedHole[] = [
      { centerX: 0, centerY: 0 } as DetectedHole,
      { centerX: 10, centerY: 0 } as DetectedHole,
    ]
    expect(computeGroupSize(holes, 0)).toBeNull()
    expect(computeGroupSize(holes, -1)).toBeNull()
  })

  it('computes max center-to-center distance plus pellet diameter', () => {
    // Two holes 30 px apart, pixelsPerMM = 10 → 3 mm CTC, +4.5 mm diameter.
    const holes: DetectedHole[] = [
      { centerX: 0, centerY: 0 } as DetectedHole,
      { centerX: 30, centerY: 0 } as DetectedHole,
    ]
    const result = computeGroupSize(holes, 10)
    expect(result).not.toBeNull()
    expect(result!.groupSizePx).toBeCloseTo(30, 2)
    expect(result!.groupSizeMM).toBeCloseTo(7.5, 3)
  })

  it('takes the maximum pair distance across 3+ holes', () => {
    // Points at (0,0), (5,0), (20,0) — max CTC is 20.
    const holes: DetectedHole[] = [
      { centerX: 0, centerY: 0 } as DetectedHole,
      { centerX: 5, centerY: 0 } as DetectedHole,
      { centerX: 20, centerY: 0 } as DetectedHole,
    ]
    const result = computeGroupSize(holes, 1, 0)
    expect(result!.groupSizePx).toBeCloseTo(20, 2)
    expect(result!.groupSizeMM).toBeCloseTo(20, 3)
  })

  it('respects custom pellet diameter', () => {
    const holes: DetectedHole[] = [
      { centerX: 0, centerY: 0 } as DetectedHole,
      { centerX: 10, centerY: 0 } as DetectedHole,
    ]
    const r177 = computeGroupSize(holes, 10, 4.5)
    const r22 = computeGroupSize(holes, 10, 5.5)
    // .22 pellets add 1mm more to the group size.
    expect(r22!.groupSizeMM - r177!.groupSizeMM).toBeCloseTo(1, 3)
  })
})

describe('detectHoles', () => {
  it('returns an empty array when pixelsPerMM is non-positive', () => {
    const img = makeImage(20, 20)
    expect(detectHoles(img, { pixelsPerMM: 0 })).toEqual([])
    expect(detectHoles(img, { pixelsPerMM: -5 })).toEqual([])
  })

  it('returns an empty array for a uniform white image', () => {
    const img = makeImage(40, 40, 255)
    const holes = detectHoles(img, { pixelsPerMM: 1 })
    expect(holes).toEqual([])
  })

  it('detects a single dark spot of the expected size', () => {
    // pixelsPerMM=1, pelletDiameter=4.5 → expected radius 2.25px.
    // A 5×5 dark square (radius ≈ 2.82px) falls inside the valid range.
    const img = makeImage(40, 40, 255)
    fillRect(img, 17, 17, 5, 5, 30)

    const holes = detectHoles(img, {
      pixelsPerMM: 1,
      pelletDiameterMM: 4.5,
      minConfidence: 0.1,
    })

    expect(holes.length).toBeGreaterThanOrEqual(1)
    const [top] = holes
    // Centroid should be near (19, 19) — the center of a 5x5 block at (17,17).
    expect(top.centerX).toBeGreaterThan(17)
    expect(top.centerX).toBeLessThan(22)
    expect(top.centerY).toBeGreaterThan(17)
    expect(top.centerY).toBeLessThan(22)
    expect(top.confidence).toBeGreaterThan(0)
    expect(top.confidence).toBeLessThanOrEqual(1)
  })

  it('respects maxHoles by returning at most N results', () => {
    const img = makeImage(80, 80, 255)
    // Lay down 4 well-separated dark squares.
    fillRect(img, 10, 10, 5, 5, 20)
    fillRect(img, 60, 10, 5, 5, 20)
    fillRect(img, 10, 60, 5, 5, 20)
    fillRect(img, 60, 60, 5, 5, 20)

    const holes = detectHoles(img, {
      pixelsPerMM: 1,
      pelletDiameterMM: 4.5,
      minConfidence: 0.1,
      maxHoles: 2,
    })

    expect(holes.length).toBeLessThanOrEqual(2)
  })

  it('returns holes sorted by confidence descending', () => {
    const img = makeImage(80, 80, 255)
    fillRect(img, 10, 10, 5, 5, 20)
    fillRect(img, 60, 60, 5, 5, 20)

    const holes = detectHoles(img, {
      pixelsPerMM: 1,
      pelletDiameterMM: 4.5,
      minConfidence: 0,
    })

    for (let i = 1; i < holes.length; i++) {
      expect(holes[i - 1].confidence).toBeGreaterThanOrEqual(holes[i].confidence)
    }
  })

  it('filters out blobs smaller than the expected pellet size', () => {
    // A single dark pixel at pixelsPerMM=10 is far too small to be a .177 pellet.
    const img = makeImage(40, 40, 255)
    fillRect(img, 20, 20, 1, 1, 20)

    const holes = detectHoles(img, {
      pixelsPerMM: 10,
      pelletDiameterMM: 4.5,
    })
    expect(holes).toEqual([])
  })
})
