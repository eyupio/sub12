import { describe, expect, it } from 'vitest'
import { applyAspect, clampRect, hitTestCrop } from '../cropGeometry'

// The image is letterboxed on the canvas, so its footprint has an origin as
// well as a size. Everything below is about the bottom of that footprint being
// reachable — the top of the image is trivially reachable either way.
describe('crop geometry', () => {
  // A portrait stage showing a landscape photo: 75px of letterbox above and
  // below the image.
  const bounds = { x: 0, y: 75, w: 390, h: 520 }

  it('keeps a rect inside bounds that do not start at the canvas origin', () => {
    const r = clampRect({ x: 0, y: 400, w: 200, h: 200 }, bounds)
    expect(r.y).toBe(395) // bottom-aligned against the image, not against y=0
    expect(r.y + r.h).toBe(bounds.y + bounds.h)
  })

  it('lets a ratio-locked crop reach the bottom edge of the image', () => {
    const atBottom = { x: 0, y: 205, w: 390, h: 390 }
    const r = applyAspect(atBottom, 1, 'se', bounds)
    expect(r.y + r.h).toBeCloseTo(bounds.y + bounds.h)
    expect(r.w).toBeCloseTo(r.h)
  })

  it('pins the bottom edge when resizing from the top', () => {
    const r = applyAspect({ x: 0, y: 195, w: 300, h: 400 }, 1, 'n', bounds)
    expect(r.y + r.h).toBeCloseTo(595)
  })

  it('grabs the bottom edge from the letterbox band outside the image', () => {
    const crop = { x: 0, y: 75, w: 390, h: 520 }
    // A fingertip landing 20px below the image still means "the bottom line";
    // a cursor is held to the tighter band.
    expect(hitTestCrop(crop, 195, 615, 24)).toBe('s')
    expect(hitTestCrop(crop, 195, 615, 12)).toBeNull()
  })

  it('prefers the nearer edge when a short crop overlaps both bands', () => {
    const crop = { x: 0, y: 300, w: 390, h: 20 }
    expect(hitTestCrop(crop, 195, 320, 24)).toBe('s')
    expect(hitTestCrop(crop, 195, 300, 24)).toBe('n')
  })
})
