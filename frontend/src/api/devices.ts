import { api } from './client'

export type DevicePlatform = 'ios' | 'android' | 'web'

export const devicesApi = {
  // Register or refresh this device's push token for the signed-in user.
  register: (token: string, platform: DevicePlatform) =>
    api.post<{ registered: boolean }>('/devices', { token, platform }),

  // Remove this device's push token (e.g. on logout).
  unregister: (token: string) =>
    api.del<{ registered: boolean }>('/devices', { body: { token } }),
}
