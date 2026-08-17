import { describe, it, expect, afterEach } from 'vitest'
import {
  applyAccents,
  brandingCss,
  documentTitleFor,
  BRANDING_STYLE_ID,
  DEFAULT_ACCENT_DARK,
  DEFAULT_ACCENT_LIGHT,
} from '../branding'

afterEach(() => {
  document.getElementById(BRANDING_STYLE_ID)?.remove()
})

describe('brandingCss', () => {
  it('is empty when the deployment has set no accent', () => {
    expect(brandingCss('', '')).toBe('')
  })

  it('derives the whole gold family from one colour', () => {
    const css = brandingCss('#4f7a3f', '')
    // A plain --gold override leaves --ring, --brass-dim, --shadow-gold and the
    // grid line as rgba() literals of the *old* hue, which is what produced
    // stripes of brass on an otherwise green deployment.
    for (const token of ['--gold:', '--gold-2:', '--gold-soft:', '--gold-tint:', '--brass-dim:', '--brass-glow:', '--ring:', '--grid:', '--shadow-gold:']) {
      expect(css).toContain(token)
    }
    expect(css).toContain('--gold: #4f7a3f')
    expect(css).toContain('rgba(79, 122, 63,')
  })

  it('scopes each accent to its own scheme', () => {
    const css = brandingCss(DEFAULT_ACCENT_LIGHT, DEFAULT_ACCENT_DARK)
    expect(css).toContain(':root:root {')
    expect(css).toContain(':root:root.dark {')
    // Doubled selectors: the base layer already declares these tokens on
    // :root and .dark, so an equal-specificity override would depend on
    // stylesheet order, which a dev server does not guarantee.
    expect(css).not.toMatch(/^:root \{/m)
  })

  it('accepts shorthand and uppercase hex', () => {
    expect(brandingCss('#ABC', '')).toContain('--gold: #aabbcc')
  })

  it('ignores a value that is not a colour', () => {
    // The value is interpolated into a stylesheet, so anything unparseable is
    // dropped rather than written through.
    expect(brandingCss('#fff;}html{display:none', '')).toBe('')
    expect(brandingCss('url(javascript:alert(1))', '')).toBe('')
  })
})

describe('applyAccents', () => {
  it('reuses one style element rather than stacking', () => {
    applyAccents('#4f7a3f', '#87b06d')
    applyAccents('#8c3b45', '#cf7c86')
    expect(document.querySelectorAll(`#${BRANDING_STYLE_ID}`)).toHaveLength(1)
    expect(document.getElementById(BRANDING_STYLE_ID)?.textContent).toContain('#8c3b45')
  })

  it('removes the stylesheet when the accents are cleared', () => {
    applyAccents('#4f7a3f', '#87b06d')
    applyAccents('', '')
    expect(document.getElementById(BRANDING_STYLE_ID)).toBeNull()
  })
})

describe('documentTitleFor', () => {
  it('leaves an unbranded deployment alone', () => {
    expect(documentTitleFor('', 'anything')).toBe('')
  })

  it('joins the name and tagline', () => {
    expect(documentTitleFor('Dale Head RC', 'Shoot straight')).toBe('Dale Head RC — Shoot straight')
    expect(documentTitleFor('Dale Head RC', '')).toBe('Dale Head RC')
  })
})
