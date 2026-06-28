import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../store/auth', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}))

import { devicesApi } from '../devices'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

describe('devicesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('register POSTs the token and platform to /devices', async () => {
    globalThis.fetch = mockFetch(200, { registered: true })
    const result = await devicesApi.register('tok-123', 'ios')
    expect(result.registered).toBe(true)
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/devices')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ token: 'tok-123', platform: 'ios' })
  })

  it('unregister sends DELETE to /devices with the token body', async () => {
    globalThis.fetch = mockFetch(200, { registered: false })
    await devicesApi.unregister('tok-123')
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/devices')
    expect(call[1].method).toBe('DELETE')
    expect(JSON.parse(call[1].body)).toEqual({ token: 'tok-123' })
  })
})
