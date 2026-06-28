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
