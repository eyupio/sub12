import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../store/theme'
import { haptics } from '../utils/haptics'

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  // Resolve effective mode: system resolves to actual preference
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  function toggle() {
    haptics.tapLight()
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 text-muted hover:text-[var(--brass)] u-press transition-colors no-min-target"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {/* Both glyphs stay mounted and cross-fade/rotate through each other, so
          the switch reads as one object turning rather than an icon swap. */}
      <span className="relative inline-block w-[17px] h-[17px]" aria-hidden="true">
        <Sun
          size={17}
          className={`absolute inset-0 transition-all duration-300 ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`}
        />
        <Moon
          size={17}
          className={`absolute inset-0 transition-all duration-300 ${isDark ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`}
        />
      </span>
      <span className="hidden sm:inline text-xs tracking-wide">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
