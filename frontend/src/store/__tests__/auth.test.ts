import { describe, it, expect, beforeEach } from 'vitest'

import { useAuthStore } from '../auth'

const freshUser = {
  id: 'u1',
  email: 'a@example.com',
  display_name: 'Alice',
  role: 'user',
}

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store + persisted localStorage between tests.
    useAuthStore.getState().clearAuth()
    window.localStorage.clear()
  })

  it('starts with null user and tokens', () => {
    const s = useAuthStore.getState()
    expect(s.user).toBeNull()
    expect(s.accessToken).toBeNull()
    expect(s.refreshToken).toBeNull()
  })

  it('setAuth stores user and tokens', () => {
    useAuthStore.getState().setAuth(freshUser, 'access-1', 'refresh-1')
    const s = useAuthStore.getState()
    expect(s.user).toEqual(freshUser)
    expect(s.accessToken).toBe('access-1')
    expect(s.refreshToken).toBe('refresh-1')
  })

  it('updateUser merges partial fields into the existing user', () => {
    useAuthStore.getState().setAuth(freshUser, 'access-1', 'refresh-1')
    useAuthStore.getState().updateUser({ display_name: 'Alicia', bio: 'pro shooter' })
    const s = useAuthStore.getState()
    expect(s.user).toMatchObject({
      id: 'u1',
      email: 'a@example.com',
      display_name: 'Alicia',
      bio: 'pro shooter',
    })
  })

  it('updateUser is a no-op when user is null', () => {
    useAuthStore.getState().updateUser({ display_name: 'nobody' })
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('clearAuth wipes user and tokens', () => {
    useAuthStore.getState().setAuth(freshUser, 'access-1', 'refresh-1')
    useAuthStore.getState().clearAuth()
    const s = useAuthStore.getState()
    expect(s.user).toBeNull()
    expect(s.accessToken).toBeNull()
    expect(s.refreshToken).toBeNull()
  })

  it('persists only the user record to localStorage; both tokens stay out', () => {
    // The refresh token now lives in an httpOnly cookie set by the backend,
    // and the access token stays in memory only. Persisting the user record
    // is enough to recognise a returning user on reload — the API client
    // will mint a fresh access token via the cookie on the first 401.
    useAuthStore.getState().setAuth(freshUser, 'access-1', 'refresh-1')

    const raw = window.localStorage.getItem('sub12-auth')
    expect(raw).not.toBeNull()

    const parsed = JSON.parse(raw as string)
    expect(parsed.state.user).toEqual(freshUser)
    expect(parsed.state.accessToken).toBeUndefined()
    expect(parsed.state.refreshToken).toBeUndefined()
  })

  it('does not persist actions (setAuth/clearAuth) in localStorage', () => {
    useAuthStore.getState().setAuth(freshUser, 'access-1', 'refresh-1')
    const parsed = JSON.parse(window.localStorage.getItem('sub12-auth') as string)
    expect(parsed.state.setAuth).toBeUndefined()
    expect(parsed.state.clearAuth).toBeUndefined()
    expect(parsed.state.updateUser).toBeUndefined()
  })
})
