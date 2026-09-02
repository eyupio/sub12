import { RefObject, useEffect } from 'react'

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Gives a dialog the three keyboard behaviours every dialog in this codebase
 * is expected to have: focus moves into it on open, Tab cycles within it, and
 * focus returns to whatever opened it on close. Escape closes it too.
 *
 * The hand-written original of this lives in FlagDialog and is copied across
 * the other established dialogs; those are left as they are. Use this for new
 * dialogs and for the ones that were missing the behaviour.
 *
 * `open` may be omitted for a dialog that is mounted only while it is open
 * (`{showing && <Thing />}`), where mounting is opening.
 */
export function useDialogFocus({
  dialogRef,
  initialFocusRef,
  onClose,
  open = true,
}: {
  dialogRef: RefObject<HTMLElement>
  initialFocusRef?: RefObject<HTMLElement>
  onClose: () => void
  open?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const returnFocusTo = document.activeElement as HTMLElement | null
    // The dialog itself is the fallback: an image viewer opened from an <img>
    // has no focusable control of its own to land on.
    const target = initialFocusRef?.current ?? dialogRef.current
    target?.focus?.()
    return () => {
      returnFocusTo?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const nodes = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose])
}
