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

// identiconSvg returns the raw SVG markup for the seed's identicon.
export function identiconSvg(seed: string): string {
  const rnd = makeRng(seed || '?')
  const hue = Math.floor(rnd() * 360)
  const fg = `hsl(${hue}, 52%, 50%)`
  const bg = `hsl(${hue}, 26%, 92%)`

  const rects: string[] = []
  // Build the left half + centre column (3 columns), mirroring onto the right
  // so the pattern is vertically symmetric like classic identicons.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (rnd() < 0.5) {
        const y = row * CELL
        rects.push(`<rect x="${col * CELL}" y="${y}" width="${CELL}" height="${CELL}"/>`)
        if (col !== 2) {
          rects.push(`<rect x="${(4 - col) * CELL}" y="${y}" width="${CELL}" height="${CELL}"/>`)
        }
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">` +
    `<rect width="100" height="100" fill="${bg}"/>` +
    `<g fill="${fg}">${rects.join('')}</g>` +
    `</svg>`
  )
}

// identiconDataUri returns the identicon as a data URI usable as an <img> src
// or CSS background.
export function identiconDataUri(seed: string): string {
  return `data:image/svg+xml,${encodeURIComponent(identiconSvg(seed))}`
}
