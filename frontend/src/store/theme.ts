import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { syncStatusBar } from '../utils/statusBar'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

function getResolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function applyToDOM(resolved: 'light' | 'dark') {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  // Update theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0C0C0C' : '#F5F5F0')
  }
  // Keep the native status bar in step with the theme (no-op on web).
  syncStatusBar(resolved)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme: Theme) => {
        set({ theme })
        applyToDOM(getResolvedTheme(theme))
      },
    }),
    {
      name: 'sub12-theme',
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => {
        // After rehydration, apply the theme
        return (state?: ThemeState) => {
          if (state) {
            applyToDOM(getResolvedTheme(state.theme))
          }
        }
      },
    },
  ),
)

// A deployment picks the theme its app boots into (and may withhold the
// toggle entirely — a club that has chosen its look does not want a member's
// screenshot coming back in the other one).
//
// `enforce` is the withheld-toggle case and always wins. Otherwise the
// deployment default only applies to a visitor who has never chosen: the
// presence of the persisted key is that record, so the choice is adopted once
// and then belongs to the visitor rather than being re-imposed on every load.
export function adoptDeploymentTheme(theme: Theme, enforce: boolean) {
  let stored: string | null = null
  try {
    stored = localStorage.getItem('sub12-theme')
  } catch { /* private mode / storage disabled — treat as no choice */ }
  if (!enforce && stored) return
  if (useThemeStore.getState().theme === theme) {
    // Already right; re-setting would only churn localStorage.
    applyToDOM(getResolvedTheme(theme))
    return
  }
  useThemeStore.getState().setTheme(theme)
}

// Apply theme immediately on import (before React mounts) to prevent FOUC
export function initTheme() {
  // Read persisted theme from localStorage
  try {
    const stored = JSON.parse(localStorage.getItem('sub12-theme') || '{}')
    const theme: Theme = stored?.state?.theme ?? 'dark'
    applyToDOM(getResolvedTheme(theme))
  } catch {
    applyToDOM('dark')
  }

  // Listen for OS preference changes when in system mode
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  mql.addEventListener('change', () => {
    const { theme } = useThemeStore.getState()
    if (theme === 'system') {
      applyToDOM(getResolvedTheme('system'))
    }
  })
}
