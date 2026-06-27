// Deterministic, GitHub-style identicon generator.
//
// Produces a symmetric 5x5 geometric pattern as an inline SVG data URI from a
// stable seed (a user id or display name). The same seed always yields the same
// pattern and colour, so a user without an uploaded avatar gets a consistent,
// recognizable generated picture instead of a plain initial.

// Small deterministic PRNG seeded from a string (FNV-1a hash → xorshift32).
// Returns a function that yields successive floats in [0, 1).
function makeRng(seed: string): () => number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  let x = h || 0x9e3779b9
  return () => {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    return x / 0x100000000
  }
}

const CELL = 20 // viewBox is 100x100 → 5 cells of 20

interface IdenticonPattern {
  fg: string // foreground colour (filled cells)
  bg: string // background colour
  cells: { x: number; y: number }[] // top-left of each filled 20x20 cell in 0..100 space
}

// identiconPattern computes the colours and filled cells for a seed. Both the
// SVG and the rasterised PNG are built from this so they stay pixel-identical.
export function identiconPattern(seed: string): IdenticonPattern {
  const rnd = makeRng(seed || '?')
  const hue = Math.floor(rnd() * 360)
  const fg = `hsl(${hue}, 52%, 50%)`
  const bg = `hsl(${hue}, 26%, 92%)`

  const cells: { x: number; y: number }[] = []
  // Build the left half + centre column (3 columns), mirroring onto the right
  // so the pattern is vertically symmetric like classic identicons.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (rnd() < 0.5) {
        const y = row * CELL
        cells.push({ x: col * CELL, y })
        if (col !== 2) {
          cells.push({ x: (4 - col) * CELL, y })
        }
      }
    }
  }

  return { fg, bg, cells }
}

// identiconSvg returns the raw SVG markup for the seed's identicon.
export function identiconSvg(seed: string): string {
  const { fg, bg, cells } = identiconPattern(seed)
  const rects = cells.map(
    ({ x, y }) => `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}"/>`,
  )

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">` +
    `<rect width="100" height="100" fill="${bg}"/>` +
    `<g fill="${fg}">${rects.join('')}</g>` +
    `</svg>`
  )
}

// randomIdenticonSeed returns a fresh random seed, so regenerating an avatar
// yields a different identicon each time (unlike the stable id-based seed).
export function randomIdenticonSeed(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

// identiconPngFile rasterises the seed's identicon to a PNG File by drawing the
// pattern directly onto a canvas (no SVG <img> decode, which avoids the
// missing-intrinsic-size pitfall). The result is uploadable via the avatar
// endpoints, which accept PNG.
export async function identiconPngFile(seed: string, size = 256): Promise<File> {
  const { fg, bg, cells } = identiconPattern(seed)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  const scale = size / 100
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = fg
  for (const { x, y } of cells) {
    ctx.fillRect(x * scale, y * scale, CELL * scale, CELL * scale)
  }
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('failed to encode avatar')
  return new File([blob], 'avatar.png', { type: 'image/png', lastModified: Date.now() })
}

// identiconDataUri returns the identicon as a data URI usable as an <img> src
// or CSS background.
export function identiconDataUri(seed: string): string {
  return `data:image/svg+xml,${encodeURIComponent(identiconSvg(seed))}`
}
