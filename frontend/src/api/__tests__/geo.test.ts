import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi, afterEach } from 'vitest'

import { geoApi, nameForPick } from '../geo'

const places = [{ name: 'Ilkley Range', lat: 53.862, lng: -1.957 }]

function qc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('nameForPick', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prefers a nearby saved place over the geocoder', async () => {
    const reverse = vi.spyOn(geoApi, 'reverse')
    const label = await nameForPick(qc(), '', 53.8621, -1.9572, places)
    expect(label).toBe('Ilkley Range')
    expect(reverse).not.toHaveBeenCalled()
  })

  it('keeps a label the user typed', async () => {
    const reverse = vi.spyOn(geoApi, 'reverse')
    const label = await nameForPick(qc(), 'Back garden', 51.5, -0.12, [])
    expect(label).toBe('Back garden')
    expect(reverse).not.toHaveBeenCalled()
  })

  it('names the point from the geocoder when nothing else knows it', async () => {
    vi.spyOn(geoApi, 'reverse').mockResolvedValue({ name: 'Otley Sports Ground, Otley' })
    const label = await nameForPick(qc(), '', 53.9, -1.7, [])
    expect(label).toBe('Otley Sports Ground, Otley')
  })

  it('rounds the coordinates it asks about so nearby picks share a lookup', async () => {
    const reverse = vi.spyOn(geoApi, 'reverse').mockResolvedValue({ name: 'Otley' })
    const client = qc()
    await nameForPick(client, '', 53.86241, -1.95782, [])
    await nameForPick(client, '', 53.86212, -1.95817, [])
    expect(reverse).toHaveBeenCalledTimes(1)
    expect(reverse).toHaveBeenCalledWith(53.862, -1.958)
  })

  it('falls back to coordinates when the geocoder knows nowhere', async () => {
    vi.spyOn(geoApi, 'reverse').mockResolvedValue(undefined)
    expect(await nameForPick(qc(), '', 0.0004, 0.0004, [])).toBe('0.000, 0.000')
  })

  it('falls back to coordinates when the lookup fails', async () => {
    vi.spyOn(geoApi, 'reverse').mockRejectedValue(new Error('offline'))
    expect(await nameForPick(qc(), '', 51.5, -0.12, [])).toBe('51.500, -0.120')
  })
})
