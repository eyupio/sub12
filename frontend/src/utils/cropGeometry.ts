// Geometry for the crop rectangle in `components/ImageEditor`.
//
// Every rectangle here is in canvas pixels, and `bounds` is the image's
// footprint on that canvas — an origin as well as a size, since a fitted image
// is letterboxed. Clamping against a bare width/height measures from the
// canvas corner instead, which puts the bottom and right bands of the image
// out of the crop's reach.

export interface Rect { x: number; y: number; w: number; h: number }

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | null

// Drawn handle size, and the grab band for a fingertip — far less precise than
// a cursor, so touch gets a wider one than the handle it is aiming at.
export const HANDLE_SIZE = 12
export const TOUCH_GRAB = 24

// The fitted image is inset from the stage so no crop edge ever sits on the
// canvas boundary. Without it the outer half of an edge's grab band falls
// outside the element — the bottom edge in particular becomes unreachable,
// since the pixels below it belong to the controls panel.
export const STAGE_INSET = 24

export function clampRect(r: Rect, bounds: Rect, minSize = 16): Rect {
  const w = Math.max(minSize, Math.min(r.w, bounds.w))
  const h = Math.max(minSize, Math.min(r.h, bounds.h))
  const x = Math.min(Math.max(r.x, bounds.x), bounds.x + bounds.w - w)
  const y = Math.min(Math.max(r.y, bounds.y), bounds.y + bounds.h - h)
  return { x, y, w, h }
}

export function applyAspect(r: Rect, ratio: number, anchor: 'center' | Handle, bounds: Rect): Rect {
  // A vertical drag sets the height and derives the width; every other handle
  // works the other way round.
  const vertical = anchor === 'n' || anchor === 's'
  let w = vertical ? r.h * ratio : r.w
  let h = vertical ? r.h : r.w / ratio
  const fit = Math.min(1, bounds.w / w, bounds.h / h)
  w *= fit
  h *= fit

  let x = r.x
  let y = r.y
  if (anchor === 'center' || anchor === null || anchor === 'move') {
    x = r.x + r.w / 2 - w / 2
    y = r.y + r.h / 2 - h / 2
  } else {
    // Pin the edges the user isn't dragging; centre the axis they aren't
    // touching at all, so a side handle grows symmetrically.
    if (anchor === 'nw' || anchor === 'w' || anchor === 'sw') x = r.x + r.w - w
    if (anchor === 'n' || anchor === 's') x = r.x + r.w / 2 - w / 2
    if (anchor === 'nw' || anchor === 'n' || anchor === 'ne') y = r.y + r.h - h
    if (anchor === 'e' || anchor === 'w') y = r.y + r.h / 2 - h / 2
  }
  return clampRect({ x, y, w, h }, bounds)
}

// Which handle (if any) a pointer at (px, py) is grabbing. `tol` widens the
// band for touch. Where two opposite bands overlap — a crop shorter or
// narrower than the band itself — the nearer edge wins, so the bottom line
// stays grabbable however small the rectangle gets.
export function hitTestCrop(crop: Rect, px: number, py: number, tol: number): Handle {
  const dLeft = Math.abs(px - crop.x)
  const dRight = Math.abs(px - (crop.x + crop.w))
  const dTop = Math.abs(py - crop.y)
  const dBottom = Math.abs(py - (crop.y + crop.h))
  const onLeft = dLeft <= tol && dLeft <= dRight
  const onRight = dRight <= tol && dRight < dLeft
  const onTop = dTop <= tol && dTop <= dBottom
  const onBottom = dBottom <= tol && dBottom < dTop
  const inX = px >= crop.x - tol && px <= crop.x + crop.w + tol
  const inY = py >= crop.y - tol && py <= crop.y + crop.h + tol
  if (onLeft && onTop) return 'nw'
  if (onRight && onTop) return 'ne'
  if (onLeft && onBottom) return 'sw'
  if (onRight && onBottom) return 'se'
  if (onTop && inX) return 'n'
  if (onBottom && inX) return 's'
  if (onLeft && inY) return 'w'
  if (onRight && inY) return 'e'
  if (px > crop.x && px < crop.x + crop.w && py > crop.y && py < crop.y + crop.h) return 'move'
  return null
}
