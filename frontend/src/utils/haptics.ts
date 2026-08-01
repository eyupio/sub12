import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

// Native-only tactile feedback. Every call is a no-op on the web build (there
// is no cross-browser equivalent worth shimming), and every call swallows its
// own errors — a device with haptics disabled must never break an interaction.

const isNative = () => Capacitor.isNativePlatform()

/** Nav taps, tab switches, chip selection — the lightest possible tick. */
export function tapLight(): void {
  if (!isNative()) return
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}

/** Primary buttons, FAB, opening a sheet. */
export function tapMedium(): void {
  if (!isNative()) return
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
}

/** Destructive confirmation — deliberately heavier than a normal press. */
export function tapHeavy(): void {
  if (!isNative()) return
  Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {})
}

/** A value committed: score saved, card submitted, achievement earned. */
export function notifySuccess(): void {
  if (!isNative()) return
  Haptics.notification({ type: NotificationType.Success }).catch(() => {})
}

/** Something needs attention but isn't a failure. */
export function notifyWarning(): void {
  if (!isNative()) return
  Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
}

/** A request failed or validation rejected the input. */
export function notifyError(): void {
  if (!isNative()) return
  Haptics.notification({ type: NotificationType.Error }).catch(() => {})
}

/** Crossing a step boundary while dragging (wizard steps, sliders). */
export function selectionChanged(): void {
  if (!isNative()) return
  Haptics.selectionChanged().catch(() => {})
}

export const haptics = {
  tapLight,
  tapMedium,
  tapHeavy,
  notifySuccess,
  notifyWarning,
  notifyError,
  selectionChanged,
}
