import { describe, expect, it } from 'vitest'

import { identiconDataUri, identiconSvg } from '../identicon'

describe('identicon', () => {
  it('produces an svg data URI', () => {
    const uri = identiconDataUri('user-123')
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml,'.length))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox="0 0 100 100"')
  })

  it('is deterministic for the same seed', () => {
    expect(identiconDataUri('alice')).toBe(identiconDataUri('alice'))
  })

  it('differs between distinct seeds', () => {
    expect(identiconDataUri('alice')).not.toBe(identiconDataUri('bob'))
  })

  it('renders a horizontally symmetric pattern', () => {
    // Each filled cell on the left half (x < 40) must have a mirror on the
    // right half (x = 80 - leftX), so the generated picture is symmetric.
    const svg = identiconSvg('symmetry-seed')
    const xs = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)"/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }))
    // Drop the background rect (no x/y attributes, so it isn't matched).
    for (const cell of xs) {
      if (cell.x < 40) {
        expect(xs.some((c) => c.y === cell.y && c.x === 80 - cell.x)).toBe(true)
      }
    }
  })
})
