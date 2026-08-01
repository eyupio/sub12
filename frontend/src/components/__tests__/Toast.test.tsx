import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToastContainer } from '../Toast'
import { toast, useToastStore } from '../../store/toast'

const SRC = join(__dirname, '..', '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function toastLayer(): number {
  const source = readFileSync(join(SRC, 'components', 'Toast.tsx'), 'utf8')
  const match = source.match(/fixed top-4 [^"']*?z-\[(\d+)\]/)
  if (!match) throw new Error('could not find the toast container z-index')
  return Number(match[1])
}

describe('ToastContainer', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })

  it('renders the message', () => {
    toast('maximum submissions per round reached', 'error')
    render(<ToastContainer />)
    expect(screen.getByRole('alert')).toHaveTextContent('maximum submissions per round reached')
  })

  // A dialog that outranks the toast layer hides the very errors raised by the
  // action the dialog started — the failure is silent, the user just sees the
  // dialog sitting there. Scan the source rather than one component, because
  // the regression arrives with whichever overlay is added next.
  it('outranks every other fixed layer in the app', () => {
    const toastZ = toastLayer()
    const offenders: string[] = []

    for (const file of sourceFiles(SRC)) {
      if (file.endsWith(join('components', 'Toast.tsx'))) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const [, z] of line.matchAll(/\bz-\[(\d+)\]/g)) {
            if (Number(z) >= toastZ) {
              offenders.push(`${file.slice(SRC.length + 1)}:${i + 1} uses z-[${z}]`)
            }
          }
        })
    }

    expect(offenders).toEqual([])
  })

  // The skip link is the one thing allowed above the toasts: it only appears
  // while it holds keyboard focus, and it must stay reachable.
  it('sits below the skip link', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    const skipLink = css.match(/\.skip-link\s*\{[^}]*z-index:\s*(\d+)/)
    expect(skipLink).not.toBeNull()
    expect(Number(skipLink![1])).toBeGreaterThan(toastLayer())
  })
})
