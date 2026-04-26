import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../store/auth', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}))

import { twoFactorApi } from '../twoFactor'
import { authApi } from '../auth'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

describe('twoFactorApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('getStatus calls GET /users/me/2fa/status', async () => {
    globalThis.fetch = mockFetch(200, { enabled: false, backup_codes_remaining: 0 })

    const out = await twoFactorApi.getStatus()

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/users/me/2fa/status')
    expect(call[1].method).toBe('GET')
    expect(out.enabled).toBe(false)
  })

  it('enrollConfirm POSTs the supplied code', async () => {
    globalThis.fetch = mockFetch(200, { backup_codes: ['AAAAAAAA'] })

    const out = await twoFactorApi.enrollConfirm('123456')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/users/me/2fa/enroll/confirm')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ code: '123456' })
    expect(out.backup_codes).toHaveLength(1)
  })

  it('disable accepts password OR code', async () => {
    globalThis.fetch = mockFetch(204, undefined)
    await twoFactorApi.disable({ password: 'hunter2' })
    let call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(call[1].body)).toEqual({ password: 'hunter2' })

    globalThis.fetch = mockFetch(204, undefined)
    await twoFactorApi.disable({ code: '654321' })
    call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(call[1].body)).toEqual({ code: '654321' })
  })

  it('loginVerify2FA POSTs to /auth/login/2fa with the challenge envelope', async () => {
    globalThis.fetch = mockFetch(200, {
      user: { id: 'u1', email: 'a@b.c', display_name: 'A', created_at: 't' },
      tokens: { access_token: 'a', refresh_token: 'r', expires_in: 3600 },
    })

    await twoFactorApi.loginVerify2FA('challenge-jwt', '123456')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/auth/login/2fa')
    expect(JSON.parse(call[1].body)).toEqual({ challenge_token: 'challenge-jwt', code: '123456' })
  })
})

describe('authApi.login (discriminated union)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns kind=complete when no 2FA challenge is set', async () => {
    globalThis.fetch = mockFetch(200, {
      user: { id: 'u1', email: 'a@b.c', display_name: 'A', created_at: 't' },
      tokens: { access_token: 'a', refresh_token: 'r', expires_in: 3600 },
    })

    const result = await authApi.login('a@b.c', 'pw')

    expect(result.kind).toBe('complete')
    if (result.kind === 'complete') {
      expect(result.tokens.access_token).toBe('a')
    }
  })

  it('returns kind=challenge when backend signals 2fa required', async () => {
    globalThis.fetch = mockFetch(200, {
      requires_2fa: true,
      challenge_token: 'cjt-xyz',
    })

    const result = await authApi.login('a@b.c', 'pw')

    expect(result.kind).toBe('challenge')
    if (result.kind === 'challenge') {
      expect(result.challengeToken).toBe('cjt-xyz')
    }
  })
})
