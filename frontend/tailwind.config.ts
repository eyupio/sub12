import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // SUB12 brand palette
        brand: {
          50:  'rgba(212,164,74,0.08)',
          100: 'rgba(212,164,74,0.15)',
          200: '#8B6520',
          300: '#A87A2A',
          400: '#D4A44A',   // Brass — signature accent
          500: '#C8983C',
          600: '#B8882C',
          700: '#A07820',
          800: '#886015',
          900: '#6A480A',
        },
        gunmetal: '#0C0C0C',
        carbon:   '#111111',
        steel:    '#888888',
        range:    '#2D5A27',
      },
      // Override slate to match brand darks
      slate: {
        900: '#111111',
        950: '#0C0C0C',
      },
      fontFamily: {
        sans: ['DM Sans', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
