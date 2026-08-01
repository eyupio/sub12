import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Package, Camera, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { Rifle } from '../api/gear'
import type { RifleStats } from '../api/stats'
import { toast } from '../store/toast'
import { ImageEditor } from './ImageEditor'

interface RifleProfileCardProps {
  rifle: Rifle
  stats?: RifleStats
  mode: 'dashboard' | 'gear' | 'profile'
  onUploadImage?: (file: File) => void
  isUploadPending?: boolean
  onEdit?: () => void
  onDelete?: () => void
  globalBest?: number
}

function StatRow({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1">
      <span className="text-[11px] text-muted tracking-wide">{label}:</span>
      <span className={`text-sm font-mono ${gold ? 'text-[var(--brass)]' : 'text-secondary'}`}>{value}</span>
    </div>
  )
}

function ScoreBar({ score, max = 250 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100))
  return (
    <div className="relative h-1 w-full rounded-full bg-surface-hover overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-[var(--brass)]/35"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

const frameCls =
  'relative bg-surface border border-subtle rounded-lg overflow-hidden hover:border-[var(--brass)]/30 transition-colors'

export function RifleProfileCard({
  rifle,
  stats,
  mode,
  onUploadImage,
  isUploadPending,
  onEdit,
  onDelete,
  globalBest,
}: RifleProfileCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingFile, setEditingFile] = useState<File | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setEditingFile(file)
  }

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

  const image = rifle.image_url ? (
    <img src={rifle.image_url} alt={`${rifle.make} ${rifle.model}`} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full flex items-center justify-center">
      <Package size={28} className="text-muted opacity-40" />
    </div>
  )

  const imageCls = 'w-20 h-20 lg:w-24 lg:h-24 rounded-full border-2 border-[var(--brass)]/30 mx-auto overflow-hidden bg-surface-hover'

  const cardContent = (
    <>
      {/* Header */}
      <div className="bg-[var(--brass)]/10 border-b border-[var(--brass)]/20 px-4 py-2">
        <p className="text-[10px] tracking-widest uppercase text-[var(--brass)] text-center font-medium">
          Rifle Profile
        </p>
      </div>

      {/* Image area */}
      <div className="px-4 pt-5 pb-3">
        {mode === 'gear' ? (
          // The photo is the obvious place to tap to change it, so it opens the
          // picker rather than forming part of the showcase link.
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadPending}
            aria-label="Change photo"
            className={`tap-target group relative z-10 block ${imageCls} disabled:cursor-not-allowed`}
          >
            {image}
            <span className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]/70 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              {isUploadPending
                ? <Loader2 size={18} className="animate-spin text-[var(--brass)]" />
                : <Camera size={18} className="text-[var(--brass)]" />}
            </span>
          </button>
        ) : (
          <div className={imageCls}>{image}</div>
        )}

        {/* Name + sub-line */}
        <p className="text-base font-medium text-primary text-center mt-3">
          {rifle.make} {rifle.model}
        </p>
        <p className="text-[11px] text-muted text-center tracking-wide mt-0.5">
          {[rifle.calibre, rifle.power_ftlb != null ? `${rifle.power_ftlb} ft·lb` : ''].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* Divider + Stats */}
      <div className="border-t border-subtle mx-4" />
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 gap-x-4">
          <StatRow label="Cards Logged" value={stats ? String(stats.card_count) : '—'} />
          <StatRow label="Shots Fired" value={stats ? String(stats.card_count * 25) : '—'} />
          <StatRow label="Best Score" value={stats?.best_score != null ? String(stats.best_score) : '—'} gold={stats?.best_score != null} />
          <StatRow label="Best X Count" value={stats?.best_x_count != null ? String(stats.best_x_count) : '—'} gold={stats?.best_x_count != null && stats.best_x_count > 0} />
        </div>

        {/* Score bar — dashboard mode only */}
        {mode === 'dashboard' && stats?.best_score != null && (
          <div className="mt-3">
            <ScoreBar score={stats.best_score} max={globalBest ?? 250} />
          </div>
        )}
      </div>
    </>
  )

  if (mode === 'dashboard') {
    return <Link to="/scores" className={`${frameCls} block`}>{cardContent}</Link>
  }

  if (mode !== 'gear') {
    return <div className={frameCls}>{cardContent}</div>
  }

  // In the gear list the card body opens the rifle showcase, but the link is a
  // stretched anchor laid over that body rather than a wrapper around it: the
  // photo button and the action bar sit above it, so no control can navigate.
  // The file input stays outside the link too — the click() we fire on it used
  // to bubble to the anchor and open the showcase before the picker returned.
  return (
    <>
      <div className={frameCls}>
        {cardContent}

        <Link
          to="/gear/rifles/$id"
          params={{ id: rifle.id }}
          aria-label={`Open the ${rifle.make} ${rifle.model} showcase`}
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
            aria-label="Edit rifle"
            className={`${actionCls} border-l border-subtle hover:text-[var(--brass)]`}
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete rifle"
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
        onChange={handleFileChange}
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
