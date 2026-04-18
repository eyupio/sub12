import { create } from 'zustand'

const MAX_HISTORY = 20

interface NavigationState {
  history: string[]
  push: (path: string) => void
  /** Returns the most recent path in history matching any of the given prefixes, or undefined. */
  findRecent: (prefixes: string[]) => string | undefined
  /** Returns the second-most-recent path (i.e. the previous one, before the current). */
  previous: () => string | undefined
  clear: () => void
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  history: [],
  push: (path: string) =>
    set((state) => {
      // Skip consecutive duplicates.
      if (state.history[state.history.length - 1] === path) return state
      const next = [...state.history, path]
      if (next.length > MAX_HISTORY) next.shift()
      return { history: next }
    }),
  findRecent: (prefixes: string[]) => {
    const { history } = get()
    // Skip the last entry (the current route) and search backwards.
    for (let i = history.length - 2; i >= 0; i--) {
      const entry = history[i]
      if (prefixes.some((p) => entry === p || entry.startsWith(p))) return entry
    }
    return undefined
  },
  previous: () => {
    const { history } = get()
    if (history.length < 2) return undefined
    return history[history.length - 2]
  },
  clear: () => set({ history: [] }),
}))
