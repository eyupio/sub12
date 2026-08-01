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
 * Gear page read the same.
 *
 * The showcase link is a stretched anchor laid over the card body rather than a
 * wrapper around it, so no control is ever a descendant of the link: the photo
 * button and the action bar sit above it and cannot navigate. The file input
 * lives outside the link too — the click() we fire on it used to bubble to the
 * anchor and open the showcase before the picker returned.
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

  const actionCls =
    'flex items-center justify-center gap-1.5 py-2.5 text-[11px] tracking-widest uppercase text-muted transition-colors hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <>
      <div className="relative bg-surface border border-subtle rounded-lg overflow-hidden hover:border-[var(--brass)]/30 transition-colors">
        <div className="bg-[var(--brass)]/10 border-b border-[var(--brass)]/20 px-4 py-2">
          <p className="text-[10px] tracking-widest uppercase text-[var(--brass)] text-center font-medium">
            Pellet Profile
          </p>
        </div>

        <div className="px-4 pt-5 pb-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadPending}
            aria-label="Change photo"
            className="tap-target group relative z-10 block w-20 h-20 lg:w-24 lg:h-24 rounded-full border-2 border-[var(--brass)]/30 mx-auto overflow-hidden bg-surface-hover disabled:cursor-not-allowed"
          >
            {pellet.image_url ? (
              <img src={pellet.image_url} alt={`${pellet.brand} ${pellet.model}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Circle size={26} className="text-muted opacity-40" />
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]/70 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              {isUploadPending
                ? <Loader2 size={18} className="animate-spin text-[var(--brass)]" />
                : <Camera size={18} className="text-[var(--brass)]" />}
            </span>
          </button>

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

        <Link
          to="/gear/pellets/$id"
          params={{ id: pellet.id }}
          aria-label={`Open the ${pellet.brand} ${pellet.model} showcase`}
          className="absolute inset-0"
        />

        <div className="relative z-10 grid grid-cols-3 border-t border-subtle bg-surface">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadPending}
            aria-label="Change photo"
            className={`${actionCls} hover:text-[var(--brass)]`}
          >
            {isUploadPending ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} Photo
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit pellet"
            className={`${actionCls} border-l border-subtle hover:text-[var(--brass)]`}
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete pellet"
            className={`${actionCls} border-l border-subtle hover:text-[var(--error-text)]`}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

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
