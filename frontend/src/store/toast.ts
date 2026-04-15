import { create } from 'zustand'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  error: 6000,
  success: 4000,
  info: 4000,
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, variant?: ToastVariant, duration?: number) => void
  removeToast: (id: string) => void
  pauseToast: (id: string) => void
  resumeToast: (id: string) => void
}

let nextId = 0
const timers = new Map<string, { timerId: ReturnType<typeof setTimeout>; remaining: number; startedAt: number }>()

function startTimer(id: string, remaining: number, remove: (id: string) => void) {
  const timerId = setTimeout(() => {
    timers.delete(id)
    remove(id)
  }, remaining)
  timers.set(id, { timerId, remaining, startedAt: Date.now() })
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (message, variant = 'info', duration?: number) => {
    const id = String(++nextId)
    const ms = duration ?? DEFAULT_DURATIONS[variant]
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }))
    startTimer(id, ms, (tid) => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== tid) }))
    })
  },
  removeToast: (id) => {
    const entry = timers.get(id)
    if (entry) {
      clearTimeout(entry.timerId)
      timers.delete(id)
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
  pauseToast: (id) => {
    const entry = timers.get(id)
    if (!entry) return
    clearTimeout(entry.timerId)
    const elapsed = Date.now() - entry.startedAt
    timers.set(id, { ...entry, remaining: Math.max(entry.remaining - elapsed, 500), timerId: undefined as unknown as ReturnType<typeof setTimeout> })
  },
  resumeToast: (id) => {
    const entry = timers.get(id)
    if (!entry) return
    startTimer(id, entry.remaining, (tid) => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== tid) }))
    })
  },
}))

export function toast(message: string, variant?: ToastVariant, duration?: number) {
  useToastStore.getState().addToast(message, variant, duration)
}
