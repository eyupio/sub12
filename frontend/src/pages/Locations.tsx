import { useState } from 'react'
import { MapPin, Plus, Pencil, Trash2, LocateFixed, X, Check } from 'lucide-react'
import { useLocations, useCreateLocation, useUpdateLocation, useDeleteLocation, type Location, type CreateLocationInput } from '../api/locations'
import { TARGET_PRESETS } from '../config/targetPresets'
import { useToastStore } from '../store/toast'

const EMPTY_FORM: CreateLocationInput = {
  name: '',
  address: '',
  lat: undefined,
  lng: undefined,
  default_distance_m: undefined,
  default_distance_unit: 'meters',
  default_target_preset: '',
  notes: '',
}

export default function Locations() {
  const { data: locations = [], isLoading } = useLocations()
  const createMutation = useCreateLocation()
  const updateMutation = useUpdateLocation()
  const deleteMutation = useDeleteLocation()
  const { show } = useToastStore()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [form, setForm] = useState<CreateLocationInput>(EMPTY_FORM)
  const [detectLoading, setDetectLoading] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
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
      notes: loc.notes ?? '',
    })
    setShowForm(true)
  }

  const handleDetect = () => {
    if (!navigator.geolocation) return
    setDetectLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude }))
        setDetectLoading(false)
      },
      () => setDetectLoading(false),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, input: form })
        show('Location updated', 'success')
      } else {
        await createMutation.mutateAsync(form)
        show('Location saved', 'success')
      }
      setShowForm(false)
    } catch {
      show('Failed to save location', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this location?')) return
    try {
      await deleteMutation.mutateAsync(id)
      show('Location deleted', 'success')
    } catch {
      show('Failed to delete location', 'error')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <MapPin className="w-6 h-6 text-teal-500" />
          Locations
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Location
        </button>
      </div>

      {isLoading && <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>}

      {!isLoading && locations.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No saved locations yet. Add one to quickly pre-fill distance and target settings.</p>
        </div>
      )}

      <ul className="space-y-3">
        {locations.map(loc => (
          <li key={loc.id} className="flex items-start justify-between p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="space-y-0.5">
              <p className="font-semibold text-gray-900 dark:text-white">{loc.name}</p>
              {loc.address && <p className="text-sm text-gray-500 dark:text-gray-400">{loc.address}</p>}
              {loc.lat != null && loc.lng != null && (
                <p className="text-xs text-gray-400">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-1">
                {loc.default_distance_m != null && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                    {loc.default_distance_m} {loc.default_distance_unit ?? 'meters'}
                  </span>
                )}
                {loc.default_target_preset && (
                  <span className="text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-2 py-0.5 rounded">
                    {TARGET_PRESETS.find(p => p.id === loc.default_target_preset)?.name ?? loc.default_target_preset}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0 ml-4">
              <button onClick={() => openEdit(loc)} className="p-1.5 text-gray-400 hover:text-teal-500">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(loc.id)} className="p-1.5 text-gray-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">{editing ? 'Edit Location' : 'Add Location'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  placeholder="e.g. Home range"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                <input
                  type="text"
                  value={form.address ?? ''}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  placeholder="Street, city…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lat ?? ''}
                    onChange={e => setForm(f => ({ ...f, lat: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lng ?? ''}
                    onChange={e => setForm(f => ({ ...f, lng: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleDetect}
                disabled={detectLoading}
                className="flex items-center gap-2 text-sm text-teal-600 dark:text-teal-400 hover:underline"
              >
                <LocateFixed className="w-4 h-4" />
                {detectLoading ? 'Detecting…' : 'Use my current location'}
              </button>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default distance</label>
                  <input
                    type="number"
                    value={form.default_distance_m ?? ''}
                    onChange={e => setForm(f => ({ ...f, default_distance_m: e.target.value ? parseInt(e.target.value) : undefined }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="e.g. 6"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit</label>
                  <select
                    value={form.default_distance_unit ?? 'meters'}
                    onChange={e => setForm(f => ({ ...f, default_distance_unit: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="meters">Metres</option>
                    <option value="yards">Yards</option>
                    <option value="feet">Feet</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default target preset</label>
                <select
                  value={form.default_target_preset ?? ''}
                  onChange={e => setForm(f => ({ ...f, default_target_preset: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="">None</option>
                  {TARGET_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={form.notes ?? ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editing ? 'Save changes' : 'Add location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
