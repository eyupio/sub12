// Turns a deployment's chosen accent colour into the design system's gold
// family, so a self-hoster picks one colour and every surface follows.
//
// The palette in index.css hangs off `--gold`: `--brass` is an alias of it, and
// a dozen more tokens (`--ring`, `--brass-dim`, `--shadow-gold`, the grid line)
// are rgba() literals of the same hue that a plain `--gold` override would
// leave behind as stripes of the old colour. Those are recomputed here rather
// than aliased, because CSS cannot derive an rgba() from a hex custom property.

export const BRANDING_STYLE_ID = 'sub12-branding'

// The stock accents, so the branding UI can show what "no override" means and
// a reset can put them back rather than leaving an empty box.
export const DEFAULT_ACCENT_LIGHT = '#a07b2c'
export const DEFAULT_ACCENT_DARK = '#d4a44a'

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let body = m[1]
  if (body.length === 3) body = body.split('').map((c) => c + c).join('')
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ]
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

// mix pulls a colour `amount` of the way towards white (1) or black (0).
function mix(rgb: [number, number, number], towards: 0 | 1, amount: number): string {
  const target = towards === 1 ? 255 : 0
  return toHex(rgb.map((v) => v + (target - v) * amount) as [number, number, number])
}

function rgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

// One theme's worth of accent tokens. The light and dark schemes tint in
// opposite directions — a light surface wants a pale wash of the accent behind
// a pill, a dark one wants a deep one — so `towards` differs per scheme rather
// than the two sharing a single derived set.
function accentBlock(selector: string, accent: string, scheme: 'light' | 'dark'): string {
  const rgb = hexToRgb(accent)
  if (!rgb) return ''
  const light = scheme === 'light'
  const decls: Record<string, string> = {
    '--gold': toHex(rgb),
    '--gold-2': mix(rgb, 1, light ? 0.1 : 0.14),
    '--gold-soft': light ? mix(rgb, 1, 0.35) : mix(rgb, 0, 0.2),
    '--gold-tint': light ? mix(rgb, 1, 0.82) : mix(rgb, 0, 0.75),
    '--brass-dim': rgba(rgb, light ? 0.12 : 0.15),
    '--brass-glow': rgba(rgb, light ? 0.03 : 0.06),
    '--ring': rgba(rgb, light ? 0.18 : 0.22),
    '--grid': rgba(rgb, light ? 0.06 : 0.04),
    '--shadow-gold': `0 8px 24px -6px ${rgba(rgb, light ? 0.35 : 0.3)}`,
  }
  const body = Object.entries(decls).map(([k, v]) => `  ${k}: ${v};`).join('\n')
  return `${selector} {\n${body}\n}`
}

// brandingCss builds the stylesheet for a pair of accents. Either may be empty,
// which leaves that scheme on the stock palette.
//
// The selectors are doubled (`:root:root`) purely for specificity: the base
// layer already declares these tokens on `:root` and `.dark`, and an injected
// override has to outrank them wherever it lands in the document, including a
// dev server that appends its own <style> tags after ours.
export function brandingCss(accentLight: string, accentDark: string): string {
  return [
    accentLight ? accentBlock(':root:root', accentLight, 'light') : '',
    accentDark ? accentBlock(':root:root.dark', accentDark, 'dark') : '',
  ].filter(Boolean).join('\n')
}

// applyAccents writes (or clears) the branding stylesheet. Idempotent: it
// reuses the same element, so a settings save repaints rather than stacking.
export function applyAccents(accentLight: string, accentDark: string): void {
  if (typeof document === 'undefined') return
  const css = brandingCss(accentLight, accentDark)
  let el = document.getElementById(BRANDING_STYLE_ID) as HTMLStyleElement | null
  if (!css) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('style')
    el.id = BRANDING_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = css
}

// documentTitleFor is what the tab says. A deployment that has not renamed
// itself keeps the shipped title, so this only ever adds a name — it never
// strips the descriptive half a search result relies on.
export function documentTitleFor(siteName: string, tagline: string): string {
  const name = siteName.trim()
  if (!name) return ''
  const sub = tagline.trim()
  return sub ? `${name} — ${sub}` : name
}
