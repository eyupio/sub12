import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../store/theme'

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  // Resolve effective mode: system resolves to actual preference
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  function toggle() {
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 text-muted hover:text-secondary transition-colors"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
      <span className="hidden sm:inline text-xs tracking-wide">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
