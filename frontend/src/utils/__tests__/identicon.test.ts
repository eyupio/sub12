import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  identiconDataUri,
  identiconPattern,
  identiconPngFile,
  identiconSvg,
  randomIdenticonSeed,
} from '../identicon'

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

describe('identiconPattern', () => {
  it('is deterministic for the same seed', () => {
    expect(identiconPattern('alice')).toEqual(identiconPattern('alice'))
  })

  it('produces foreground/background colours and cells', () => {
    const { fg, bg, cells } = identiconPattern('user-123')
    expect(fg).toMatch(/^hsl\(/)
    expect(bg).toMatch(/^hsl\(/)
    expect(cells.length).toBeGreaterThan(0)
  })

  it('produces a horizontally symmetric set of cells', () => {
    const { cells } = identiconPattern('symmetry-seed')
    for (const cell of cells) {
      if (cell.x < 40) {
        expect(cells.some((c) => c.y === cell.y && c.x === 80 - cell.x)).toBe(true)
      }
    }
  })
})

describe('randomIdenticonSeed', () => {
  it('returns distinct non-empty seeds across calls', () => {
    const a = randomIdenticonSeed()
    const b = randomIdenticonSeed()
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(a).not.toBe(b)
  })
})

describe('identiconPngFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockCanvas(blob: Blob | null) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      set fillStyle(_v: string) {},
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(blob)
    })
  }

  it('returns a png File named avatar.png', async () => {
    mockCanvas(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
    const file = await identiconPngFile('seed', 64)
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/png')
    expect(file.name).toBe('avatar.png')
  })

  it('rejects when the canvas yields no blob', async () => {
    mockCanvas(null)
    await expect(identiconPngFile('seed')).rejects.toThrow()
  })
})
