import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Camera, Circle, Eye, EyeOff, Loader2, Pencil, Trash2 } from 'lucide-react'
import type { Pellet } from '../api/gear'
import { toast } from '../store/toast'
import { ImageEditor } from './ImageEditor'

interface PelletProfileCardProps {
  pellet: Pellet
  onUploadImage?: (file: File) => void
  isUploadPending?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-1">
      <span className="text-[11px] text-muted tracking-wide">{label}:</span>
      <span className="text-sm font-mono text-secondary">{value}</span>
    </div>
  )
}

/**
 * Gear-list card for a pellet. Mirrors RifleProfileCard so both halves of the
 * Gear page read the same; the whole card opens the pellet showcase and the
 * action icons stop propagation so they still work inside the link.
 */
export function PelletProfileCard({
  pellet,
  onUploadImage,
  isUploadPending,
  onEdit,
  onDelete,
}: PelletProfileCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingFile, setEditingFile] = useState<File | null>(null)

  const onEdited = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be under 5 MB', 'error')
      setEditingFile(null)
      return
    }
    setEditingFile(null)
    onUploadImage?.(file)
  }

  return (
    <>
      <Link to="/gear/pellets/$id" params={{ id: pellet.id }} className="block">
        <div className="bg-surface border border-subtle rounded-lg overflow-hidden hover:border-[var(--brass)]/30 transition-colors">
          <div className="bg-[var(--brass)]/10 border-b border-[var(--brass)]/20 px-4 py-2">
            <p className="text-[10px] tracking-widest uppercase text-[var(--brass)] text-center font-medium">
              Pellet Profile
            </p>
          </div>

          <div className="relative px-4 pt-5 pb-3">
            <div className="absolute left-3 top-5 flex flex-col gap-2.5">
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click() }}
                disabled={isUploadPending}
                className="tap-target w-8 h-8 rounded-full border border-subtle bg-surface-hover flex items-center justify-center text-muted hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Upload image"
              >
                {isUploadPending ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              </button>
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); onEdit?.() }}
                className="tap-target w-8 h-8 rounded-full border border-subtle bg-surface-hover flex items-center justify-center text-muted hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors"
                aria-label="Edit pellet"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete?.() }}
                className="tap-target w-8 h-8 rounded-full border border-subtle bg-surface-hover flex items-center justify-center text-muted hover:text-[var(--error-text)] hover:border-[var(--error-text)]/40 transition-colors"
                aria-label="Delete pellet"
              >
                <Trash2 size={13} />
              </button>
            </div>

            <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full border-2 border-[var(--brass)]/30 mx-auto overflow-hidden bg-surface-hover">
              {pellet.image_url ? (
                <img src={pellet.image_url} alt={`${pellet.brand} ${pellet.model}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Circle size={26} className="text-muted opacity-40" />
                </div>
              )}
            </div>

            <p className="text-base font-medium text-primary text-center mt-3">
              {pellet.brand} {pellet.model}
            </p>
            <p className="text-[11px] text-muted text-center tracking-wide mt-0.5">
              {[
                pellet.head_size_mm != null ? `${pellet.head_size_mm}mm` : '',
                pellet.weight_grains != null ? `${pellet.weight_grains}gr` : '',
              ].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>

          <div className="border-t border-subtle mx-4" />
          <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-x-4">
              <StatRow label="Head Size" value={pellet.head_size_mm != null ? `${pellet.head_size_mm}mm` : '—'} />
              <StatRow label="Weight" value={pellet.weight_grains != null ? `${pellet.weight_grains}gr` : '—'} />
              <StatRow label="Batch" value={pellet.batch_code || '—'} />
              <div className="flex justify-between items-baseline py-1">
                <span className="text-[11px] text-muted tracking-wide">Comparison:</span>
                <span className={`flex items-center gap-1 text-[11px] ${pellet.comparison_opt_in ? 'text-[var(--brass)]' : 'text-muted'}`}>
                  {pellet.comparison_opt_in ? <Eye size={11} /> : <EyeOff size={11} />}
                  {pellet.comparison_opt_in ? 'On' : 'Off'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
      {/* Outside the link: the click() we fire on this input would otherwise
          bubble to the anchor and navigate to the showcase. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) setEditingFile(file)
        }}
      />
      {editingFile && (
        <ImageEditor
          file={editingFile}
          onSave={onEdited}
          onCancel={() => setEditingFile(null)}
        />
      )}
    </>
  )
}
