import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { devicesApi, type DevicePlatform } from '../api/devices'
import { router } from '../router'

let started = false
let currentToken: string | null = null

function platform(): DevicePlatform {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
}

// Map a tapped notification's data payload to an in-app route. The backend
// attaches target_type / target_id; fall back to the notifications screen so a
// tap always lands somewhere sensible.
function pathFromData(data: Record<string, unknown> | undefined): string {
  const targetId = typeof data?.target_id === 'string' ? data.target_id : ''
  const targetType = typeof data?.target_type === 'string' ? data.target_type : ''
  if (targetId) {
    if (targetType === 'score_card') return `/scores/${targetId}`
    if (targetType === 'pellet_test') return `/pellet-testing/${targetId}`
  }
  return '/notifications'
}

// Register this device for push and forward its token to the backend. Native
// only and safe to call repeatedly (guards against double registration).
// Requires VITE_FCM_ENABLED=true and a valid google-services.json in the
// Android project — without either, calling register() crashes the JVM because
// FirebaseMessaging.getInstance() throws before JS try/catch can intercept it.
export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform() || started) return
  if (import.meta.env.VITE_FCM_ENABLED !== 'true') return
  started = true
  try {
    await PushNotifications.addListener('registration', (token) => {
      currentToken = token.value
      devicesApi.register(token.value, platform()).catch(() => {})
    })
    await PushNotifications.addListener('registrationError', () => {})
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      router.history.push(pathFromData(action.notification.data as Record<string, unknown> | undefined))
    })

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive === 'granted') {
      await PushNotifications.register()
    } else {
      started = false
    }
  } catch {
    // No native push support / transport not configured — leave push disabled.
    started = false
  }
}

// Tear down push on logout: drop the token server-side and remove listeners so a
// later login re-registers cleanly.
export async function teardownPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    if (currentToken) {
      await devicesApi.unregister(currentToken).catch(() => {})
      currentToken = null
    }
    await PushNotifications.removeAllListeners()
  } catch {
    // best-effort
  } finally {
    started = false
  }
}
