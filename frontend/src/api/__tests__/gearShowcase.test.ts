import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../store/auth', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}))

import { gearApi } from '../gear'
import { adminGearApi } from '../adminGear'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

const lastCall = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]

describe('gearApi showcase', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the rifle showcase for an id', async () => {
    globalThis.fetch = mockFetch(200, { rifle: { id: 'r1' } })

    await gearApi.getRifleShowcase('r1')

    const [url, init] = lastCall()
    expect(url).toContain('/rifles/r1/showcase')
    expect(init.method).toBe('GET')
  })

  it('fetches the pellet showcase for an id', async () => {
    globalThis.fetch = mockFetch(200, { pellet: { id: 'p1' } })

    await gearApi.getPelletShowcase('p1')

    expect(lastCall()[0]).toContain('/pellets/p1/showcase')
  })

  // The opt-in flag is what gates a gear item's contribution to public
  // aggregates, so it has to survive the PATCH body verbatim.
  it('sends comparison_opt_in when toggling a single rifle', async () => {
    globalThis.fetch = mockFetch(200, { id: 'r1', comparison_opt_in: false })

    await gearApi.updateRifle('r1', { comparison_opt_in: false })

    const [url, init] = lastCall()
    expect(url).toContain('/rifles/r1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ comparison_opt_in: false })
  })

  it('sends comparison_opt_in when toggling a single pellet', async () => {
    globalThis.fetch = mockFetch(200, { id: 'p1', comparison_opt_in: true })

    await gearApi.updatePellet('p1', { comparison_opt_in: true })

    expect(JSON.parse(lastCall()[1].body)).toEqual({ comparison_opt_in: true })
  })

  it('opts all gear in or out through one endpoint', async () => {
    globalThis.fetch = mockFetch(200, { opt_in: false, rifles_updated: 2, pellets_updated: 5 })

    const res = await gearApi.setComparisonOptInAll(false)

    const [url, init] = lastCall()
    expect(url).toContain('/users/me/gear-comparison')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ opt_in: false })
    expect(res.rifles_updated + res.pellets_updated).toBe(7)
  })
})

describe('adminGearApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('requests the gear stats dashboard', async () => {
    globalThis.fetch = mockFetch(200, { totals: {} })

    await adminGearApi.getStats()

    expect(lastCall()[0]).toContain('/admin/gear/stats')
  })

  it('passes kind, sort and paging through to the models endpoint', async () => {
    globalThis.fetch = mockFetch(200, { items: [], total: 0 })

    await adminGearApi.listModels({ kind: 'pellet', sort: 'best_group', q: 'jsb', limit: 10, offset: 20 })

    const url = new URL(lastCall()[0], 'http://localhost')
    expect(url.searchParams.get('kind')).toBe('pellet')
    expect(url.searchParams.get('sort')).toBe('best_group')
    expect(url.searchParams.get('q')).toBe('jsb')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('offset')).toBe('20')
  })

  it('defaults paging when the caller omits it', async () => {
    globalThis.fetch = mockFetch(200, { items: [], total: 0 })

    await adminGearApi.listModels({ kind: 'rifle' })

    const url = new URL(lastCall()[0], 'http://localhost')
    expect(url.searchParams.get('limit')).toBe('25')
    expect(url.searchParams.get('offset')).toBe('0')
    expect(url.searchParams.has('q')).toBe(false)
  })

  // Gear names carry spaces and punctuation ("Air Arms S510 Ultimate Sporter"),
  // so the drill-down must encode them rather than splice them into the query.
  it('encodes make and model in the drill-down query', async () => {
    globalThis.fetch = mockFetch(200, { model: {}, owners: [], trend: [] })

    await adminGearApi.getModelDetail('rifle', 'Air Arms', 'S510 Ultimate Sporter')

    const raw = lastCall()[0] as string
    expect(raw).not.toContain(' ')

    const url = new URL(raw, 'http://localhost')
    expect(url.searchParams.get('make')).toBe('Air Arms')
    expect(url.searchParams.get('model')).toBe('S510 Ultimate Sporter')
  })
})
