import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  const { refreshToken, setAuth, clearAuth } = useAuthStore.getState()
  if (!refreshToken) return false

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const tokens = await res.json()
    const user = useAuthStore.getState().user
    if (user) {
      setAuth(user, tokens.access_token, tokens.refresh_token)
    }
    return true
  } catch {
    clearAuth()
    return false
  }
}

async function handleUnauthorized(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { body, headers, ...rest } = options
  const token = useAuthStore.getState().accessToken

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  })

  if (res.status === 401 && !isRetry && token) {
    const refreshed = await handleUnauthorized()
    if (refreshed) {
      return request<T>(path, options, true)
    }
    useAuthStore.getState().clearAuth()
    toast('Your session has expired. Please sign in again.', 'error')
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const text = await res.text()
    let msg = text
    try { const parsed = JSON.parse(text); if (parsed.error) msg = parsed.error } catch { /* not JSON */ }
    throw new ApiError(res.status, msg)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function requestMultipart<T>(path: string, formData: FormData, isRetry = false): Promise<T> {
  const token = useAuthStore.getState().accessToken

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  })

  if (res.status === 401 && !isRetry && token) {
    const refreshed = await handleUnauthorized()
    if (refreshed) {
      return requestMultipart<T>(path, formData, true)
    }
    useAuthStore.getState().clearAuth()
    toast('Your session has expired. Please sign in again.', 'error')
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const text = await res.text()
    let msg = text
    try { const parsed = JSON.parse(text); if (parsed.error) msg = parsed.error } catch { /* not JSON */ }
    throw new ApiError(res.status, msg)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, init?: RequestOptions) => request<T>(path, { method: 'GET', ...init }),
  post: <T>(path: string, body: unknown, init?: RequestOptions) =>
    request<T>(path, { method: 'POST', body, ...init }),
  patch: <T>(path: string, body: unknown, init?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body, ...init }),
  del: <T>(path: string, init?: RequestOptions) => request<T>(path, { method: 'DELETE', ...init }),
  upload: <T>(path: string, formData: FormData) => requestMultipart<T>(path, formData),
}
