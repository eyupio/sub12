import { useRef, useState } from 'react'
import { Camera, Check, Loader2, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  useLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  useUploadLocationImage,
  type Location,
  type CreateLocationInput,
} from '../api/locations'
import { TARGET_PRESETS, CUSTOM_PRESET_ID, getPresetById } from '../config/targetPresets'
import { toast } from '../store/toast'
import { LocationMapThumbnail } from '../components/LocationMapThumbnail'
import { MapLocationPicker, type PickedLocation } from '../components/MapLocationPicker'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SkeletonList } from '../components/Skeleton'

const EMPTY_FORM: CreateLocationInput = {
  name: '',
  address: '',
  lat: undefined,
  lng: undefined,
  default_distance_m: undefined,
  default_distance_unit: 'meters',
  default_target_preset: '',
  custom_target_width_mm: undefined,
  custom_target_height_mm: undefined,
  notes: '',
}

const inputCls =
  'w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/60'

function describePreset(id: string | undefined, widthMm?: number, heightMm?: number) {
  if (!id) return null
  if (id === CUSTOM_PRESET_ID) {
    if (widthMm && heightMm) return `Custom ${widthMm} × ${heightMm} mm`
    return 'Custom'
  }
  const preset = getPresetById(id)
  if (!preset) return id
  return preset.name
}

export default function Locations() {
  const { data: locations = [], isLoading } = useLocations()
  const createMutation = useCreateLocation()
  const updateMutation = useUpdateLocation()
  const deleteMutation = useDeleteLocation()
  const uploadImageMutation = useUploadLocationImage()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [form, setForm] = useState<CreateLocationInput>(EMPTY_FORM)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setPendingImage(null)
    setPendingImagePreview(null)
    setShowForm(true)
  }

  const openEdit = (loc: Location) => {
    setEditing(loc)
    setForm({
      name: loc.name,
      address: loc.address ?? '',
      lat: loc.lat,
      lng: loc.lng,
      default_distance_m: loc.default_distance_m,
      default_distance_unit: loc.default_distance_unit ?? 'meters',
      default_target_preset: loc.default_target_preset ?? '',
      custom_target_width_mm: loc.custom_target_width_mm,
      custom_target_height_mm: loc.custom_target_height_mm,
      notes: loc.notes ?? '',
    })
    setPendingImage(null)
    setPendingImagePreview(null)
    setShowForm(true)
  }

  const handleFileSelect = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be under 5 MB', 'error')
      return
    }
    setPendingImage(file)
    setPendingImagePreview(URL.createObjectURL(file))
    if (editing) {
      // Upload immediately for existing location
      uploadImageMutation.mutate(
        { id: editing.id, file },
        {
          onSuccess: () => toast('Image updated', 'success'),
          onError: () => toast('Failed to upload image', 'error'),
        },
      )
    }
  }

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()

    const presetId = form.default_target_preset || undefined
    const payload: CreateLocationInput = {
      ...form,
      default_target_preset: presetId,
      custom_target_width_mm: presetId === CUSTOM_PRESET_ID ? form.custom_target_width_mm : undefined,
      custom_target_height_mm: presetId === CUSTOM_PRESET_ID ? form.custom_target_height_mm : undefined,
    }

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, input: payload })
        toast('Location updated', 'success')
      } else {
        const created = await createMutation.mutateAsync(payload)
        if (pendingImage) {
          try {
            await uploadImageMutation.mutateAsync({ id: created.id, file: pendingImage })
          } catch {
            toast('Saved, but image upload failed', 'error')
          }
        }
        toast('Location saved', 'success')
      }
      setShowForm(false)
    } catch {
      toast('Failed to save location', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast('Location deleted', 'success')
    } catch {
      toast('Failed to delete location', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handlePicked = (picked: PickedLocation) => {
    setForm(f => ({
      ...f,
      lat: picked.lat,
      lng: picked.lng,
      address: f.address || picked.label,
    }))
    setPickerOpen(false)
  }

  const presetIsCustom = form.default_target_preset === CUSTOM_PRESET_ID

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <MapPin className="w-6 h-6 text-[var(--brass)]" />
          Locations
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--brass)] text-black rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Location
        </button>
      </div>

      {isLoading && <SkeletonList count={4} />}

      {!isLoading && locations.length === 0 && (
        <div className="text-center py-12 text-muted">
          <MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No saved locations yet. Add one to quickly pre-fill distance and target settings.</p>
        </div>
      )}

      <ul className="space-y-3">
        {locations.map(loc => {
          const presetLabel = describePreset(
            loc.default_target_preset,
            loc.custom_target_width_mm,
            loc.custom_target_height_mm,
          )
          return (
            <li
              key={loc.id}
              className="p-4 bg-surface rounded-xl shadow-card border border-subtle space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {loc.image_url && (
                    <img
                      src={loc.image_url}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover border border-subtle shrink-0"
                    />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-primary truncate">{loc.name}</p>
                    {loc.address && <p className="text-sm text-secondary truncate">{loc.address}</p>}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {loc.default_distance_m != null && (
                        <span className="text-xs bg-surface-hover text-secondary px-2 py-0.5 rounded border border-subtle">
                          {loc.default_distance_m} {loc.default_distance_unit ?? 'meters'}
                        </span>
                      )}
                      {presetLabel && (
                        <span className="text-xs bg-[var(--brass-pill-bg)] text-[var(--brass)] px-2 py-0.5 rounded">
                          {presetLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(loc)}
                    className="p-1.5 text-muted hover:text-[var(--brass)] transition-colors"
                    aria-label="Edit location"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(loc)}
                    className="p-1.5 text-muted hover:text-[var(--red)] transition-colors"
                    aria-label="Delete location"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {loc.lat != null && loc.lng != null && (
                <LocationMapThumbnail label={loc.address ?? loc.name} lat={loc.lat} lng={loc.lng} />
              )}
            </li>
          )
        })}
      </ul>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-surface border border-subtle rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-subtle">
              <h2 className="font-semibold text-primary">{editing ? 'Edit Location' : 'Add Location'}</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-muted hover:text-secondary transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitForm} className="p-4 space-y-4">
              {/* Image */}
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadImageMutation.isPending}
                  className="relative w-16 h-16 rounded-lg overflow-hidden border border-subtle hover:border-[var(--brass)]/50 transition-colors shrink-0 disabled:opacity-50"
                  aria-label="Upload image"
                >
                  {pendingImagePreview || editing?.image_url ? (
                    <img
                      src={pendingImagePreview ?? editing?.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-surface-hover flex items-center justify-center">
                      <Camera size={18} className="text-muted" />
                    </div>
                  )}
                  {uploadImageMutation.isPending && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 size={18} className="text-white animate-spin" />
                    </div>
                  )}
                </button>
                <div className="text-xs text-muted">
                  {editing?.image_url || pendingImagePreview ? 'Tap to replace' : 'Tap to add a photo (max 5 MB)'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Name *</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Home range"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Address</label>
                <input
                  type="text"
                  value={form.address ?? ''}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className={inputCls}
                  placeholder="Street, city…"
                />
              </div>

              {/* Map picker */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-secondary">Coordinates</label>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-sm text-primary hover:border-[var(--brass)]/50 transition-colors flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[var(--brass)]" />
                    {form.lat != null && form.lng != null ? 'Adjust on map' : 'Pick on map'}
                  </span>
                  {form.lat != null && form.lng != null && (
                    <span className="text-xs text-muted font-mono tabular-nums">
                      {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                    </span>
                  )}
                </button>
                {form.lat != null && form.lng != null && (
                  <LocationMapThumbnail
                    label={form.address || form.name || 'Selected'}
                    lat={form.lat}
                    lng={form.lng}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">Default distance</label>
                  <input
                    type="number"
                    value={form.default_distance_m ?? ''}
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        default_distance_m: e.target.value ? parseInt(e.target.value) : undefined,
                      }))
                    }
                    className={inputCls}
                    placeholder="e.g. 6"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">Unit</label>
                  <select
                    value={form.default_distance_unit ?? 'meters'}
                    onChange={e => setForm(f => ({ ...f, default_distance_unit: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="meters">Metres</option>
                    <option value="yards">Yards</option>
                    <option value="feet">Feet</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Default target preset</label>
                <select
                  value={form.default_target_preset ?? ''}
                  onChange={e => setForm(f => ({ ...f, default_target_preset: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">None</option>
                  {TARGET_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value={CUSTOM_PRESET_ID}>Custom (set width × height)</option>
                </select>
              </div>

              {presetIsCustom && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Width (mm)</label>
                    <input
                      type="number"
                      min={1}
                      value={form.custom_target_width_mm ?? ''}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          custom_target_width_mm: e.target.value ? parseInt(e.target.value) : undefined,
                        }))
                      }
                      className={inputCls}
                      placeholder="e.g. 150"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Height (mm)</label>
                    <input
                      type="number"
                      min={1}
                      value={form.custom_target_height_mm ?? ''}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          custom_target_height_mm: e.target.value ? parseInt(e.target.value) : undefined,
                        }))
                      }
                      className={inputCls}
                      placeholder="e.g. 150"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Notes</label>
                <textarea
                  value={form.notes ?? ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border border-subtle rounded-lg text-sm text-secondary hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[var(--brass)] text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editing ? 'Save changes' : 'Add location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MapLocationPicker
        open={pickerOpen}
        initialLabel={form.address ?? form.name ?? ''}
        initialLat={form.lat}
        initialLng={form.lng}
        onPick={handlePicked}
        onCancel={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.name ?? 'this location'}?`}
        message="This location will be permanently removed. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
