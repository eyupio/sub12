import { Capacitor } from '@capacitor/core'
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

// Native builds load the SPA from a local WebView origin (capacitor://localhost
// on iOS, https://localhost on Android), so a relative '/api/v1' can never reach
// the backend. Point native apps at the canonical production host. VITE_API_URL
// still wins when set, so a staging/beta build can be retargeted at build time.
const isNative = Capacitor.isNativePlatform()
const NATIVE_API_URL = 'https://sub12.io/api/v1'
const BASE_URL = import.meta.env.VITE_API_URL ?? (isNative ? NATIVE_API_URL : '/api/v1')

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

let refreshPromise: Promise<boolean> | null = null
const AUTH_PATH_PREFIX = '/auth/'

async function tryRefreshToken(): Promise<boolean> {
  // Web/PWA: refresh uses the httpOnly `sub12_refresh` cookie set by the backend
  // on login. The browser attaches it automatically because we send the request
  // with credentials:'include'; we never see or send the value ourselves, so an
  // XSS payload reading localStorage cannot mint tokens.
  //
  // Native: the cookie is SameSite=Lax and the request is cross-site (local
  // WebView origin → sub12.io), so the cookie is not attached. We instead pass
  // the persisted refresh token explicitly; the backend accepts it as a JSON
  // body fallback on /auth/refresh.
  const { setAuth, clearAuth, refreshToken } = useAuthStore.getState()
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      ...(isNative
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken ?? '' }),
          }
        : {}),
    })
    if (!res.ok) {
      // No valid refresh cookie (expired / revoked / never set). Drop the
      // persisted user so a subsequent rehydrate doesn't loop on the same 4xx.
      clearAuth()
      return false
    }
    const tokens = await res.json()
    const user = useAuthStore.getState().user
    if (user) {
      setAuth(user, tokens.access_token, tokens.refresh_token ?? '')
    }
    return true
  } catch {
    clearAuth()
    return false
  }
}

// Reads the response body and extracts the human-readable error message.
// The backend wraps errors as `{ "error": "..." }` JSON; for non-JSON bodies
// (e.g. plain-text gateway errors) the raw text is used as-is.
async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const parsed = JSON.parse(text)
    if (parsed.error) return parsed.error
  } catch { /* not JSON */ }
  return text
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
  let token = useAuthStore.getState().accessToken

  // After a page reload the access token (in-memory only) is gone but the
  // persisted user remains. Refresh upfront so OptionalAuthenticate-gated
  // endpoints see the viewer and return owner/scorer flags correctly.
  if (!token && !path.startsWith(AUTH_PATH_PREFIX) && useAuthStore.getState().user) {
    await handleUnauthorized()
    token = useAuthStore.getState().accessToken
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  })

  if (
    res.status === 401 &&
    !isRetry &&
    !path.startsWith(AUTH_PATH_PREFIX) &&
    (token || useAuthStore.getState().user)
  ) {
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
    throw new ApiError(res.status, await parseErrorMessage(res))
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function requestMultipart<T>(path: string, formData: FormData, isRetry = false): Promise<T> {
  let token = useAuthStore.getState().accessToken

  if (!token && !path.startsWith(AUTH_PATH_PREFIX) && useAuthStore.getState().user) {
    await handleUnauthorized()
    token = useAuthStore.getState().accessToken
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  })

  if (
    res.status === 401 &&
    !isRetry &&
    !path.startsWith(AUTH_PATH_PREFIX) &&
    (token || useAuthStore.getState().user)
  ) {
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
    throw new ApiError(res.status, await parseErrorMessage(res))
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
  put: <T>(path: string, body: unknown, init?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body, ...init }),
  del: <T>(path: string, init?: RequestOptions) => request<T>(path, { method: 'DELETE', ...init }),
  upload: <T>(path: string, formData: FormData) => requestMultipart<T>(path, formData),
}
