import { useRef, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useDialogFocus } from '../useDialogFocus'

function Dialog({ onClose, open = true }: { onClose: () => void; open?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)
  useDialogFocus({ dialogRef, initialFocusRef: firstRef, onClose, open })
  if (!open) return null
  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Test dialog">
      <button ref={firstRef}>First</button>
      <button>Middle</button>
      <button>Last</button>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Outside</button>
      <Dialog onClose={() => setOpen(false)} open={open} />
    </>
  )
}

describe('useDialogFocus', () => {
  it('moves focus into the dialog on open', () => {
    render(<Dialog onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))
  })

  it('falls back to the dialog itself when no initial target is given', () => {
    function NoTarget() {
      const dialogRef = useRef<HTMLDivElement>(null)
      useDialogFocus({ dialogRef, onClose: () => {} })
      return <div ref={dialogRef} tabIndex={-1} role="dialog" aria-label="Bare" />
    }
    render(<NoTarget />)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Dialog onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last control back to the first', () => {
    render(<Dialog onClose={() => {}} />)
    const last = screen.getByRole('button', { name: 'Last' })
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))
  })

  it('wraps Shift+Tab from the first control back to the last', () => {
    render(<Dialog onClose={() => {}} />)
    screen.getByRole('button', { name: 'First' }).focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last' }))
  })

  it('restores focus to whatever opened it on close', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(opener)
  })

  it('does nothing while closed', () => {
    const onClose = vi.fn()
    render(<Dialog onClose={onClose} open={false} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
