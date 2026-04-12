import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../store/auth', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}))

import { adminEmailApi } from '../adminEmail'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

describe('adminEmailApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('patchSettings sends PATCH body with smtp fields', async () => {
    globalThis.fetch = mockFetch(200, { host: 'smtp.example.com' })

    await adminEmailApi.patchSettings({
      host: 'smtp.example.com',
      port: 587,
      username: 'mailer',
      password_encrypted: 'secret',
      from_email: 'no-reply@example.com',
      from_name: 'Sub12',
      use_tls: false,
      use_starttls: true,
    })

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].method).toBe('PATCH')
    expect(call[0]).toContain('/admin/email/settings')
    expect(JSON.parse(call[1].body)).toEqual({
      host: 'smtp.example.com',
      port: 587,
      username: 'mailer',
      password_encrypted: 'secret',
      from_email: 'no-reply@example.com',
      from_name: 'Sub12',
      use_tls: false,
      use_starttls: true,
    })
  })

  it('previewTemplate sends POST payload object', async () => {
    globalThis.fetch = mockFetch(200, { subject: 'Preview' })

    await adminEmailApi.previewTemplate('welcome', { payload: { display_name: 'Alex' } })

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].method).toBe('POST')
    expect(call[0]).toContain('/admin/email/templates/welcome/preview')
    expect(JSON.parse(call[1].body)).toEqual({ payload: { display_name: 'Alex' } })
  })
})
