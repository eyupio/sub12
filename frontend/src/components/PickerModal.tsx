import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export interface PickerItem {
  id: string
  primary: ReactNode
  secondary?: ReactNode
  thumbUrl?: string
  thumbFallback?: ReactNode
}

interface PickerModalProps {
  open: boolean
  title: string
  items: PickerItem[]
  loading?: boolean
  emptyMessage?: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function PickerModal({ open, title, items, loading, emptyMessage, onSelect, onClose }: PickerModalProps) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-surface border border-subtle rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <h3 className="t-subsection-title">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading && <p className="text-center text-sm text-muted p-6">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="text-center text-sm text-muted p-6">{emptyMessage ?? 'Nothing to show.'}</p>
          )}
          {!loading && items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-[var(--hover-bg,rgba(0,0,0,0.04))] transition text-left"
            >
              <div className="w-10 h-10 rounded bg-[var(--muted-bg,rgba(0,0,0,0.05))] flex items-center justify-center overflow-hidden shrink-0">
                {item.thumbUrl ? (
                  <img src={item.thumbUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  item.thumbFallback ?? null
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-primary truncate">{item.primary}</div>
                {item.secondary && <div className="text-xs text-muted truncate">{item.secondary}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
