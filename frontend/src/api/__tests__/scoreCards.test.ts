import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the auth store before importing the module under test.
vi.mock('../../store/auth', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}))

import { scoreCardApi } from '../scoreCards'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

describe('scoreCardApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('create sends POST with shot data', async () => {
    const card = { id: 'abc', total_score: 200, x_count: 5 }
    globalThis.fetch = mockFetch(201, card)

    const result = await scoreCardApi.create({
      shot_at: '2025-01-01',
      shot_scores: Array(25).fill(8),
      shot_xs: Array(25).fill(false),
    })

    expect(result).toEqual(card)
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].method).toBe('POST')
    expect(call[0]).toContain('/score-cards')
  })

  it('update sends PATCH with shot data', async () => {
    const card = { id: 'abc', total_score: 250, x_count: 25, verification: 'pending' }
    globalThis.fetch = mockFetch(200, card)

    const result = await scoreCardApi.update('abc', {
      shot_at: '2025-01-01',
      shot_scores: Array(25).fill(10),
      shot_xs: Array(25).fill(true),
    })

    expect(result).toEqual(card)
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].method).toBe('PATCH')
    expect(call[0]).toContain('/score-cards/abc')
  })

  it('list returns items array', async () => {
    const body = { items: [{ id: '1' }, { id: '2' }] }
    globalThis.fetch = mockFetch(200, body)

    const result = await scoreCardApi.list()
    expect(result.items).toHaveLength(2)
  })

  it('list with scope passes query parameter', async () => {
    const body = { items: [{ id: '1' }] }
    globalThis.fetch = mockFetch(200, body)

    await scoreCardApi.list(20, 0, 'personal')
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('scope=personal')
  })

  it('list with league scope passes query parameter', async () => {
    const body = { items: [] }
    globalThis.fetch = mockFetch(200, body)

    await scoreCardApi.list(20, 0, 'league')
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('scope=league')
  })

  it('get fetches single card by id', async () => {
    const card = { id: 'xyz', total_score: 100 }
    globalThis.fetch = mockFetch(200, card)

    const result = await scoreCardApi.get('xyz')
    expect(result.id).toBe('xyz')
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/score-cards/xyz')
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = mockFetch(422, { error: 'invalid' })

    await expect(scoreCardApi.create({
      shot_at: '2025-01-01',
      shot_scores: Array(10).fill(8),
      shot_xs: Array(10).fill(false),
    })).rejects.toThrow('invalid')
  })

  it('uploadImage sends multipart form data', async () => {
    globalThis.fetch = mockFetch(200, { card_image_url: '/api/v1/images/123' })

    const file = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' })
    const result = await scoreCardApi.uploadImage('card1', file)

    expect(result.card_image_url).toBe('/api/v1/images/123')
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].method).toBe('POST')
    expect(call[1].body).toBeInstanceOf(FormData)
  })
})
