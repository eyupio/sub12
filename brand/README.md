# SUB12 Brand Assets

## Colour Palette

| Name     | Hex       | Usage                                    |
|----------|-----------|------------------------------------------|
| Gunmetal | `#0C0C0C` | Primary background, text on light        |
| Brass    | `#D4A44A` | Crosshair reticle — always brass         |
| Paper    | `#FFFFFF` | Text on dark backgrounds                 |
| Carbon   | `#1A1A1A` | Secondary dark backgrounds, cards        |
| Range    | `#2D5A27` | Success states, secondary accent         |
| Steel    | `#888888` | Tagline, muted/secondary text            |

## File Guide

| File | Use when |
|------|----------|
| `logo-primary-dark.svg` | Default — app splash, marketing on dark bg |
| `logo-primary-light.svg` | White/light backgrounds, print |
| `logo-horizontal-dark.svg` | Nav bar, header, dark UI |
| `logo-horizontal-light.svg` | Nav bar, header, light UI |
| `logo-icon.svg` | App icon, standalone mark, PWA icon source |
| `logo-icon-mono-white.svg` | Overlays on photos, reversed-out contexts — supports `color` CSS property |
| `logo-wordmark-dark.svg` | Inline text contexts, dark bg |
| `logo-wordmark-light.svg` | Inline text contexts, light bg |
| `favicon.svg` | Browser tab — use as `<link rel="icon" href="/favicon.svg">` |

## Usage Rules

1. **Crosshair is always brass** (`#D4A44A`) — never change it for any background colour.
2. **Minimum clear space**: 1× the crosshair circle diameter on all sides.
3. **Minimum size**: horizontal lockup no smaller than 80px wide; icon mark no smaller than 16px.
4. **Do not** add drop shadows, outlines, or effects to any logo variant.
5. **Do not** recolour the brass crosshair or stretch/distort proportions.
6. **Wordmark is always "SUB12"** — no hyphen, no space, all caps.

## Font

Primary: **DM Sans** (Google Fonts — `https://fonts.google.com/specimen/DM+Sans`)
- Wordmark weight: Medium 500
- Tagline weight: Regular 400

SVG fallback stack: `'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif`

## PWA Icons

Generate raster PNG icons from `logo-icon.svg` at these sizes for the PWA manifest and Capacitor:

| Size | File | Use |
|------|------|-----|
| 192×192 | `icon-192.png` | PWA manifest, Android |
| 512×512 | `icon-512.png` | PWA manifest splash |
| 180×180 | `apple-touch-icon.png` | iOS home screen |
| 32×32 | `favicon-32.png` | Fallback favicon |

Recommended tool: [Squoosh](https://squoosh.app) or `sharp` CLI:
```bash
npx sharp-cli --input logo-icon.svg --output icon-192.png --width 192 --height 192
```
