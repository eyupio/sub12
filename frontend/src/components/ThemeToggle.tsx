import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore } from '../store/theme'

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  function cycle() {
    if (theme === 'dark') setTheme('light')
    else if (theme === 'light') setTheme('system')
    else setTheme('dark')
  }

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor
  const title = theme === 'dark' ? 'Dark mode' : theme === 'light' ? 'Light mode' : 'System theme'

  return (
    <button
      onClick={cycle}
      className="text-muted hover:text-secondary transition-colors"
      aria-label={title}
      title={title}
    >
      <Icon size={17} />
    </button>
  )
}
