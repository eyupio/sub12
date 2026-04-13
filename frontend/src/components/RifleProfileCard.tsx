import { useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { Package, Camera, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { Rifle } from '../api/gear'
import type { RifleStats } from '../api/stats'
import { toast } from '../store/toast'

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast('Image must be under 5 MB', 'error')
      } else {
        onUploadImage?.(file)
      }
    }
    e.target.value = ''
  }

  const cardContent = (
    <div className="bg-surface border border-subtle rounded-lg overflow-hidden hover:border-[var(--brass)]/30 transition-colors">
      {/* Header */}
      <div className="bg-[var(--brass)]/10 border-b border-[var(--brass)]/20 px-4 py-2">
        <p className="text-[10px] tracking-widest uppercase text-[var(--brass)] text-center font-medium">
          Rifle Profile
        </p>
      </div>

      {/* Image area */}
      <div className="relative px-4 pt-5 pb-3">
        {/* Action icons — gear mode only */}
        {mode === 'gear' && (
          <div className="absolute left-3 top-5 flex flex-col gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click() }}
              disabled={isUploadPending}
              className="w-8 h-8 rounded-full border border-subtle bg-surface-hover flex items-center justify-center text-muted hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors disabled:opacity-40"
              aria-label="Upload image"
            >
              {isUploadPending ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit?.() }}
              className="w-8 h-8 rounded-full border border-subtle bg-surface-hover flex items-center justify-center text-muted hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors"
              aria-label="Edit rifle"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.() }}
              className="w-8 h-8 rounded-full border border-subtle bg-surface-hover flex items-center justify-center text-muted hover:text-[var(--error-text)] hover:border-[var(--error-text)]/40 transition-colors"
              aria-label="Delete rifle"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Rifle image */}
        <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full border-2 border-[var(--brass)]/30 mx-auto overflow-hidden bg-surface-hover">
          {rifle.image_url ? (
            <img src={rifle.image_url} alt={`${rifle.make} ${rifle.model}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package size={28} className="text-muted opacity-40" />
            </div>
          )}
        </div>

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
    </div>
  )

  if (mode === 'dashboard') {
    return <Link to="/scores">{cardContent}</Link>
  }

  return cardContent
}
