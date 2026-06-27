import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { SimulatedPersona, UpdateSimulatedPersonaInput } from '../api/adminSimulation'

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 't-section-title'

export interface PersonaEditState extends UpdateSimulatedPersonaInput {
  avatarFile?: File | null
  removeAvatar?: boolean
}

interface PersonaEditDialogProps {
  open: boolean
  persona: SimulatedPersona | null
  pending: boolean
  onSave: (state: PersonaEditState) => void
  onCancel: () => void
}

export function PersonaEditDialog({ open, persona, pending, onSave, onCancel }: PersonaEditDialogProps) {
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [club, setClub] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !persona) return
    setDisplayName(persona.display_name ?? '')
    setBio(persona.bio ?? '')
    setLocation(persona.location ?? '')
    setClub(persona.club ?? '')
    setAvatarFile(null)
    setAvatarPreview(persona.avatar_url ?? null)
  }, [open, persona])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open || !persona) return null

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setAvatarFile(f)
    if (f) {
      const reader = new FileReader()
      reader.onload = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(f)
    } else {
      setAvatarPreview(persona?.avatar_url ?? null)
    }
  }

  function submit() {
    onSave({
      display_name: displayName,
      bio,
      location,
      club,
      avatarFile,
      removeAvatar: avatarPreview === null && !!persona?.avatar_url,
    })
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative bg-surface border border-subtle rounded-lg shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-edit-title"
      >
        <div className="flex items-center gap-2">
          <Pencil size={18} className="text-[var(--brass)]" />
          <h3 id="persona-edit-title" className="t-subsection-title">Edit Persona</h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full overflow-hidden border border-subtle bg-surface-hover shrink-0">
            {avatarPreview ? (
              <img src={avatarPreview} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                {displayName?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>
          <div className="space-y-1">
            {persona.avatar_url ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="block text-xs text-[var(--brass)] hover:opacity-80 transition-opacity"
                >
                  Change avatar
                </button>
                <button
                  type="button"
                  onClick={() => { setAvatarFile(null); setAvatarPreview(null) }}
                  className="block text-xs text-muted hover:text-secondary transition-colors"
                >
                  Remove avatar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-[var(--brass)] hover:opacity-80 transition-opacity"
              >
                Upload avatar
              </button>
            )}
            {avatarFile && (
              <button
                type="button"
                onClick={() => { setAvatarFile(null); setAvatarPreview(persona.avatar_url ?? null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                className="block text-xs text-muted hover:text-secondary transition-colors"
              >
                Remove selection
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              onChange={handleFile}
              className="hidden"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelCls} htmlFor="persona-name">Display Name</label>
          <input id="persona-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls} htmlFor="persona-bio">Bio</label>
          <textarea id="persona-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls} htmlFor="persona-location">Location</label>
            <input id="persona-location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls} htmlFor="persona-club">Club</label>
            <input id="persona-club" value={club} onChange={(e) => setClub(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded border border-subtle text-sm text-muted hover:text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PersonaEditDialog
