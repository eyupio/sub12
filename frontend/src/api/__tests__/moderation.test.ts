import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../store/auth', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}))

import { commentApi } from '../scoreCards'
import { postApi } from '../posts'
import { leagueApi } from '../leagues'
import { reportsApi } from '../reports'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

describe('moderation endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('commentApi.flag posts reason to /comments/{id}/flag', async () => {
    globalThis.fetch = mockFetch(200, { flagged: true })
    const result = await commentApi.flag('c1', 'Needs amendment')
    expect(result.flagged).toBe(true)
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/comments/c1/flag')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ reason: 'Needs amendment' })
  })

  it('commentApi.unflag posts to /comments/{id}/unflag', async () => {
    globalThis.fetch = mockFetch(200, { flagged: false })
    await commentApi.unflag('c1')
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/comments/c1/unflag')
    expect(call[1].method).toBe('POST')
  })

  it('postApi.flag posts reason to /posts/{id}/flag', async () => {
    globalThis.fetch = mockFetch(200, { flagged: true })
    await postApi.flag('p1', 'Off-topic')
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/posts/p1/flag')
    expect(JSON.parse(call[1].body)).toEqual({ reason: 'Off-topic' })
  })

  it('postApi.unflag posts to /posts/{id}/unflag', async () => {
    globalThis.fetch = mockFetch(200, { flagged: false })
    await postApi.unflag('p1')
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/posts/p1/unflag')
  })

  it('leagueApi.leave sends DELETE to /leagues/{id}/members/me', async () => {
    globalThis.fetch = mockFetch(204, null)
    await leagueApi.leave('l1')
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/leagues/l1/members/me')
    expect(call[1].method).toBe('DELETE')
  })

  it('leagueApi.leave surfaces 409 as ApiError', async () => {
    globalThis.fetch = mockFetch(409, { error: 'last admin' })
    await expect(leagueApi.leave('l1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'last admin',
    })
  })

  it('reportsApi.create posts comment report to /reports without context ids', async () => {
    globalThis.fetch = mockFetch(201, { id: 'r1', target_type: 'comment', target_id: 'c1', status: 'open' })
    await reportsApi.create({
      target_type: 'comment',
      target_id: 'c1',
      reason: 'Harassment or hate',
      notes: 'mean stuff',
    })
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/reports')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({
      target_type: 'comment',
      target_id: 'c1',
      reason: 'Harassment or hate',
      notes: 'mean stuff',
    })
  })
})
