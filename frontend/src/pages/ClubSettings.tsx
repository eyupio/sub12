import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Camera, Shield, ShieldOff, Trash2, LogOut, Check, X as XIcon, RefreshCw, MapPin, Plus } from 'lucide-react'
import {
  clubsApi,
  DAY_LABELS,
  type Club,
  type ClubMember,
  type ClubOpeningHoursInput,
  type UpdateClubInput,
} from '../api/clubs'
import { ApiError } from '../api/client'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ImageEditor } from '../components/ImageEditor'
import { UserAvatar } from '../components/UserAvatar'
import { requestPosition } from '../utils/geolocation'
import { DATE_FORMAT_OPTIONS, DEFAULT_PREFS, formatDate, useRegionalPrefs, type DateFormat, type TimeFormat } from '../utils/date'
import { can, PERM } from '../utils/moderators'
import { ModeratorPermissionEditor, PermissionSummary, RoleBadge } from '../components/ModeratorPermissions'
import AnnouncementComposer from '../components/AnnouncementComposer'

const TIMEZONES: string[] = (() => {
  const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  if (typeof fn === 'function') return fn('timeZone')
  return ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']
})()

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 't-section-title'
const sectionCls = 'border border-subtle rounded bg-surface p-4 space-y-4'
const btnPrimary = 'btn-brass disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-all'

// ---------------------------------------------------------------------------
// Club Image Section
// ---------------------------------------------------------------------------

function ClubImageSection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingFile, setEditingFile] = useState<File | null>(null)

  const mutation = useMutation({
    mutationFn: (file: File) => clubsApi.uploadImage(clubId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
    },
  })

  function onEdited(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be under 5 MB', 'error')
      setEditingFile(null)
      return
    }
    setEditingFile(null)
    mutation.mutate(file)
  }

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Club Image</h2>
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
      <div className="flex items-center gap-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={mutation.isPending}
          className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-subtle hover:border-[var(--brass)]/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Upload club image"
        >
          {club.image_url ? (
            <img src={club.image_url} alt={club.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-surface-hover flex items-center justify-center">
              <Camera size={20} className="text-muted" />
            </div>
          )}
        </button>
        <div className="flex-1">
          <p className="text-sm text-secondary">
            {club.image_url ? 'Click to change image' : 'Add a profile picture for this club'}
          </p>
          <p className="text-[11px] text-muted">JPEG, PNG, or WebP. Max 5MB.</p>
          {mutation.isPending && <p className="text-[11px] text-muted mt-1">Uploading…</p>}
          {mutation.isError && <p className="text-[11px] text-[var(--error-text)] mt-1">{mutation.error instanceof Error ? mutation.error.message : 'Upload failed. Please try again.'}</p>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// General Info Section
// ---------------------------------------------------------------------------

function GeneralInfoSection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(club.name)
  const [description, setDescription] = useState(club.description ?? '')

  const mutation = useMutation({
    mutationFn: (input: { name?: string; description?: string }) =>
      clubsApi.update(clubId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Club saved', 'success')
    },
    onError: () => toast('Failed to save', 'error'),
  })

  function handleSave() {
    mutation.mutate({
      name: name.trim() || undefined,
      // Send the trimmed value even when empty — an empty string is how the
      // API clears a description, whereas undefined would keep the old one.
      description: description.trim(),
    })
  }

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">General</h2>

      <div className="space-y-1.5">
        <label className={labelCls}>Club Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className={inputCls}
          placeholder="Club name"
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className={inputCls + ' resize-none'}
          rows={3}
          placeholder="A short description of the club"
        />
      </div>

      <button onClick={handleSave} disabled={mutation.isPending || !name.trim()} className={btnPrimary} aria-label="Save general details">
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Location & Contact Section
// ---------------------------------------------------------------------------

/** Reports the API's message on a rejected club update rather than a generic one. */
function updateErrorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError && err.message ? err.message : fallback
}

function LocationContactSection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    address_line1: club.address_line1 ?? '',
    address_line2: club.address_line2 ?? '',
    city: club.city ?? '',
    region: club.region ?? '',
    postcode: club.postcode ?? '',
    country: club.country ?? '',
    website_url: club.website_url ?? '',
    contact_email: club.contact_email ?? '',
    contact_phone: club.contact_phone ?? '',
  })
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    club.latitude != null && club.longitude != null ? { lat: club.latitude, lng: club.longitude } : null,
  )
  const [locating, setLocating] = useState(false)

  const mutation = useMutation({
    mutationFn: (input: UpdateClubInput) => clubsApi.update(clubId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Location & contact saved', 'success')
    },
    onError: (err) => toast(updateErrorMessage(err, 'Failed to save location & contact'), 'error'),
  })

  function set(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function useCurrentLocation() {
    setLocating(true)
    try {
      const pos = await requestPosition()
      setCoords({ lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) })
    } catch {
      toast('Could not get your location — check location permissions.', 'error')
    } finally {
      setLocating(false)
    }
  }

  function handleSave() {
    mutation.mutate({
      ...form,
      ...(coords ? { latitude: coords.lat, longitude: coords.lng } : { clear_coordinates: true }),
    })
  }

  const fields: { key: keyof typeof form; label: string; placeholder: string; type?: string }[] = [
    { key: 'address_line1', label: 'Address', placeholder: 'Street or range name' },
    { key: 'address_line2', label: 'Address line 2', placeholder: 'Optional' },
    { key: 'city', label: 'Town / City', placeholder: 'e.g. Huddersfield' },
    { key: 'region', label: 'County / Region', placeholder: 'e.g. West Yorkshire' },
    { key: 'postcode', label: 'Postcode', placeholder: 'e.g. HD3 3FR' },
    { key: 'country', label: 'Country', placeholder: 'e.g. United Kingdom' },
    { key: 'website_url', label: 'Website', placeholder: 'https://…', type: 'url' },
    { key: 'contact_email', label: 'Contact email', placeholder: 'info@example.com', type: 'email' },
    { key: 'contact_phone', label: 'Contact phone', placeholder: 'e.g. 07700 900000', type: 'tel' },
  ]

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Location &amp; Contact</h2>
      <p className="text-[10px] text-muted -mt-2">
        Shown on the club page so shooters can find and reach you. Leave anything blank to hide it.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        {fields.map(f => (
          <div key={f.key} className="space-y-1.5">
            <label className={labelCls} htmlFor={`club-${f.key}`}>{f.label}</label>
            <input
              id={`club-${f.key}`}
              type={f.type ?? 'text'}
              value={form[f.key]}
              onChange={e => set(f.key, e.target.value)}
              className={inputCls}
              placeholder={f.placeholder}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Map pin</label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-secondary font-mono">
            {coords ? `${coords.lat}, ${coords.lng}` : 'Not set'}
          </span>
          <button type="button" onClick={useCurrentLocation} disabled={locating} className="lc-action-ghost">
            <MapPin size={12} /> {locating ? 'Locating…' : 'Use current location'}
          </button>
          {coords && (
            <button type="button" onClick={() => setCoords(null)} className="lc-action-ghost text-muted">
              <XIcon size={12} /> Remove pin
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted">A pin lets the club appear in "near me" searches.</p>
      </div>

      <button onClick={handleSave} disabled={mutation.isPending} className={btnPrimary} aria-label="Save location and contact">
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Disciplines & Facilities Section
// ---------------------------------------------------------------------------

/** Free-text tag editor used for distances and facilities. */
function TagInput({ label, hint, placeholder, values, onChange }: {
  label: string
  hint: string
  placeholder: string
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const value = draft.trim()
    if (!value) return
    if (!values.some(v => v.toLowerCase() === value.toLowerCase())) onChange([...values, value])
    setDraft('')
  }

  return (
    <div className="space-y-1.5">
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          className={inputCls}
          placeholder={placeholder}
          aria-label={label}
        />
        <button type="button" onClick={add} disabled={!draft.trim()} className="lc-action-ghost shrink-0">Add</button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {values.map(v => (
            <span key={v} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-subtle text-secondary">
              {v}
              <button type="button" onClick={() => onChange(values.filter(x => x !== v))} aria-label={`Remove ${v}`} className="text-muted hover:text-[var(--error-text)]">
                <XIcon size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted">{hint}</p>
    </div>
  )
}

function DisciplinesSection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()
  const [disciplines, setDisciplines] = useState<string[]>(club.disciplines)
  const [distances, setDistances] = useState<string[]>(club.distances)
  const [facilities, setFacilities] = useState<string[]>(club.facilities)

  // The vocabulary is owned by the API so the editor and the directory filter
  // can never drift apart.
  const { data: vocab } = useQuery({
    queryKey: ['club-disciplines'],
    queryFn: () => clubsApi.listDisciplines(),
    staleTime: Infinity,
  })

  const mutation = useMutation({
    mutationFn: (input: UpdateClubInput) => clubsApi.update(clubId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Disciplines & facilities saved', 'success')
    },
    onError: (err) => toast(updateErrorMessage(err, 'Failed to save disciplines & facilities'), 'error'),
  })

  function toggleDiscipline(value: string) {
    setDisciplines(prev => prev.includes(value) ? prev.filter(d => d !== value) : [...prev, value])
  }

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Disciplines &amp; Facilities</h2>
      <p className="text-[10px] text-muted -mt-2">
        Disciplines drive the club directory filter — pick every one you shoot.
      </p>

      <div className="space-y-1.5">
        <label className={labelCls}>Disciplines</label>
        <div className="flex flex-wrap gap-2">
          {(vocab?.items ?? []).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => toggleDiscipline(value)}
              aria-pressed={disciplines.includes(value)}
              className={`px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors ${
                disciplines.includes(value)
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <TagInput
        label="Distances"
        hint="Ranges you can shoot, e.g. 10m, 25 yards, 100m."
        placeholder="e.g. 25 yards"
        values={distances}
        onChange={setDistances}
      />
      <TagInput
        label="Facilities"
        hint="What members get on site, e.g. covered firing line, clubhouse, parking."
        placeholder="e.g. Covered firing line"
        values={facilities}
        onChange={setFacilities}
      />

      <button
        onClick={() => mutation.mutate({ disciplines, distances, facilities })}
        disabled={mutation.isPending}
        className={btnPrimary} aria-label="Save disciplines and facilities"
      >
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Membership & Visitors Section
// ---------------------------------------------------------------------------

function MembershipInfoSection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()
  const [membershipInfo, setMembershipInfo] = useState(club.membership_info ?? '')
  const [visitorPolicy, setVisitorPolicy] = useState(club.visitor_policy ?? '')
  const [established, setEstablished] = useState(club.established_year != null ? String(club.established_year) : '')

  const mutation = useMutation({
    mutationFn: (input: UpdateClubInput) => clubsApi.update(clubId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast('Membership details saved', 'success')
    },
    onError: (err) => toast(updateErrorMessage(err, 'Failed to save membership details'), 'error'),
  })

  function handleSave() {
    const year = established.trim()
    mutation.mutate({
      membership_info: membershipInfo.trim(),
      visitor_policy: visitorPolicy.trim(),
      // 0 is the API's "clear this" value for the founding year.
      established_year: year === '' ? 0 : Number(year),
    })
  }

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Membership &amp; Visitors</h2>

      <div className="space-y-1.5">
        <label className={labelCls} htmlFor="club-membership-info">How to join</label>
        <textarea
          id="club-membership-info"
          value={membershipInfo}
          onChange={e => setMembershipInfo(e.target.value)}
          className={inputCls + ' resize-none'}
          rows={4}
          placeholder="Fees, probationary period, what a new member needs to bring…"
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelCls} htmlFor="club-visitor-policy">Visitors &amp; guests</label>
        <textarea
          id="club-visitor-policy"
          value={visitorPolicy}
          onChange={e => setVisitorPolicy(e.target.value)}
          className={inputCls + ' resize-none'}
          rows={3}
          placeholder="Whether guests can shoot, booking requirements, hire availability…"
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelCls} htmlFor="club-established">Established</label>
        <input
          id="club-established"
          type="number"
          inputMode="numeric"
          value={established}
          onChange={e => setEstablished(e.target.value)}
          className={inputCls}
          placeholder="e.g. 1978"
        />
      </div>

      <button onClick={handleSave} disabled={mutation.isPending} className={btnPrimary} aria-label="Save membership details">
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Opening Hours Section
// ---------------------------------------------------------------------------

/** Editable slot state; the id keeps React keys stable across edits. */
interface SlotDraft {
  key: string
  day_of_week: number
  opens_at: string
  closes_at: string
  is_closed: boolean
  note: string
}

let slotKeySeq = 0
function newSlotKey() { return `slot-${slotKeySeq++}` }

function OpeningHoursSection({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient()
  const [slots, setSlots] = useState<SlotDraft[] | null>(null)

  const { data } = useQuery({
    queryKey: ['club', clubId, 'opening-hours'],
    queryFn: () => clubsApi.getOpeningHours(clubId),
  })

  // Seed the editor once from the server, then let local edits own the state.
  useEffect(() => {
    if (!data || slots !== null) return
    setSlots(data.items.map(h => ({
      key: h.id,
      day_of_week: h.day_of_week,
      opens_at: h.opens_at ?? '',
      closes_at: h.closes_at ?? '',
      is_closed: h.is_closed,
      note: h.note ?? '',
    })))
  }, [data, slots])

  const mutation = useMutation({
    mutationFn: (items: ClubOpeningHoursInput[]) => clubsApi.replaceOpeningHours(clubId, items),
    onSuccess: (res) => {
      queryClient.setQueryData(['club', clubId, 'opening-hours'], res)
      setSlots(res.items.map(h => ({
        key: h.id,
        day_of_week: h.day_of_week,
        opens_at: h.opens_at ?? '',
        closes_at: h.closes_at ?? '',
        is_closed: h.is_closed,
        note: h.note ?? '',
      })))
      toast('Opening times saved', 'success')
    },
    onError: (err) => toast(updateErrorMessage(err, 'Failed to save opening times'), 'error'),
  })

  const rows = slots ?? []

  function update(key: string, patch: Partial<SlotDraft>) {
    setSlots(prev => (prev ?? []).map(s => (s.key === key ? { ...s, ...patch } : s)))
  }

  function handleSave() {
    mutation.mutate(rows.map(s => ({
      day_of_week: s.day_of_week,
      opens_at: s.is_closed ? null : s.opens_at,
      closes_at: s.is_closed ? null : s.closes_at,
      is_closed: s.is_closed,
      note: s.note.trim() || null,
    })))
  }

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="t-section-title">Opening Times</h2>
        <button
          type="button"
          onClick={() => setSlots([...rows, { key: newSlotKey(), day_of_week: 0, opens_at: '10:00', closes_at: '15:00', is_closed: false, note: '' }])}
          className="lc-action-ghost"
        >
          <Plus size={12} /> Add slot
        </button>
      </div>
      <p className="text-[10px] text-muted -mt-2">
        Add a slot per session — a day can have more than one. Mark a day closed to say so explicitly.
      </p>

      {rows.length === 0 && (
        <p className="text-sm text-muted text-center py-4">No opening times published.</p>
      )}

      {rows.map(slot => (
        <div key={slot.key} className="space-y-2 py-2 border-b border-subtle last:border-0">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={slot.day_of_week}
              onChange={e => update(slot.key, { day_of_week: Number(e.target.value) })}
              className={inputCls + ' w-auto'}
              aria-label="Day of week"
            >
              {DAY_LABELS.map((label, day) => <option key={label} value={day}>{label}</option>)}
            </select>

            {!slot.is_closed && (
              <>
                <input
                  type="time"
                  value={slot.opens_at}
                  onChange={e => update(slot.key, { opens_at: e.target.value })}
                  className={inputCls + ' w-auto'}
                  aria-label="Opens at"
                />
                <span className="text-muted text-sm">–</span>
                <input
                  type="time"
                  value={slot.closes_at}
                  onChange={e => update(slot.key, { closes_at: e.target.value })}
                  className={inputCls + ' w-auto'}
                  aria-label="Closes at"
                />
              </>
            )}

            <label className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-muted">
              <input
                type="checkbox"
                checked={slot.is_closed}
                onChange={e => update(slot.key, { is_closed: e.target.checked })}
              />
              Closed
            </label>

            <button
              type="button"
              onClick={() => setSlots(rows.filter(s => s.key !== slot.key))}
              className="p-1 rounded text-muted hover:text-[var(--error-text)] ml-auto"
              aria-label="Remove slot"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <input
            type="text"
            value={slot.note}
            onChange={e => update(slot.key, { note: e.target.value })}
            className={inputCls}
            placeholder="Note (optional) — e.g. pre-booking required"
            aria-label="Slot note"
          />
        </div>
      ))}

      <button onClick={handleSave} disabled={mutation.isPending} className={btnPrimary} aria-label="Save opening times">
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Privacy Section
// ---------------------------------------------------------------------------

function PrivacySection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (input: {
      type?: 'public' | 'private'
      join_policy?: 'open' | 'invite_code' | 'approval'
      post_visibility?: 'members' | 'public'
    }) => clubsApi.update(clubId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Privacy updated', 'success')
    },
    onError: () => toast('Failed to update privacy', 'error'),
  })

  const regenMutation = useMutation({
    mutationFn: () => clubsApi.regenerateJoinCode(clubId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast('Join code regenerated', 'success')
    },
    onError: () => toast('Failed to regenerate code', 'error'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Privacy & Joining</h2>

      <div className="space-y-1.5">
        <label className={labelCls}>Visibility</label>
        <div className="grid grid-cols-2 gap-2">
          {(['public', 'private'] as const).map(value => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ type: value })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                club.type === value
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          {club.type === 'private'
            ? 'Private clubs are hidden from the directory. Only members see content.'
            : 'Public clubs appear in the club directory.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Join Policy</label>
        <div className="grid grid-cols-3 gap-2">
          {(['open', 'invite_code', 'approval'] as const).map(value => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ join_policy: value })}
              className={`px-2 py-2 rounded border text-[10px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                club.join_policy === value
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {value === 'invite_code' ? 'Code' : value}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          {club.join_policy === 'open' && 'Anyone can join instantly.'}
          {club.join_policy === 'invite_code' && 'Members need the join code to join.'}
          {club.join_policy === 'approval' && 'Moderators review and approve each join request.'}
        </p>
      </div>

      {club.join_policy === 'invite_code' && (
        <div className="space-y-1.5">
          <label className={labelCls}>Join Code</label>
          <div className="flex items-center gap-2 bg-surface rounded p-3 border border-subtle">
            <code className="font-mono text-sm text-[var(--brass)] flex-1">{club.join_code || '—'}</code>
            <button
              type="button"
              onClick={() => regenMutation.mutate()}
              disabled={regenMutation.isPending}
              className="text-muted hover:text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Regenerate code"
              aria-label="Regenerate join code"
            >
              <RefreshCw size={14} className={regenMutation.isPending ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-[10px] text-muted">Regenerating invalidates the previous code.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label className={labelCls}>Post Visibility</label>
        <div className="grid grid-cols-2 gap-2">
          {(['members', 'public'] as const).map(value => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ post_visibility: value })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                club.post_visibility === value
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">
          {club.post_visibility === 'public'
            ? 'Posts and their activity may appear on the public feed. Members’ own privacy settings still apply.'
            : 'Posts are only visible to club members.'}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Regional Defaults Section
// ---------------------------------------------------------------------------

function RegionalSection({ clubId, club }: { clubId: string; club: Club }) {
  const queryClient = useQueryClient()
  const currentDateFormat = (club.date_format as DateFormat | undefined) ?? DEFAULT_PREFS.dateFormat
  const currentTimeFormat = (club.time_format as TimeFormat | undefined) ?? DEFAULT_PREFS.timeFormat
  const currentTimezone = club.timezone || DEFAULT_PREFS.timezone

  const mutation = useMutation({
    mutationFn: (input: { date_format?: string; time_format?: string; timezone?: string }) =>
      clubsApi.update(clubId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast('Regional defaults saved', 'success')
    },
    onError: () => toast('Failed to save regional defaults', 'error'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Regional Defaults</h2>
      <p className="text-[10px] text-muted -mt-2">
        Applied on public pages for this club. Logged-in users see their own preference.
      </p>

      <div className="space-y-1.5">
        <label className={labelCls}>Date Format</label>
        <div className="flex flex-wrap gap-2">
          {DATE_FORMAT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ date_format: value })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                currentDateFormat === value
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Time Format</label>
        <div className="flex gap-2">
          {(['24h', '12h'] as const).map((v) => (
            <button
              key={v}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ time_format: v })}
              className={`px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                currentTimeFormat === v
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {v === '24h' ? '24-hour' : '12-hour'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="club-timezone" className={labelCls}>Timezone</label>
        <select
          id="club-timezone"
          value={currentTimezone}
          onChange={(e) => mutation.mutate({ timezone: e.target.value })}
          disabled={mutation.isPending}
          className={inputCls}
        >
          {!TIMEZONES.includes(currentTimezone) && (
            <option value={currentTimezone}>{currentTimezone}</option>
          )}
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Join Requests Section
// ---------------------------------------------------------------------------

function JoinRequestsSection({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient()
  const prefs = useRegionalPrefs()

  const { data } = useQuery({
    queryKey: ['club', clubId, 'join-requests', 'pending'],
    queryFn: () => clubsApi.listJoinRequests(clubId, 'pending'),
  })

  const decideMutation = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: 'approved' | 'rejected' }) =>
      clubsApi.decideJoinRequest(clubId, requestId, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'join-requests', 'pending'] })
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast('Request decided', 'success')
    },
    onError: () => toast('Failed to decide request', 'error'),
  })

  const requests = data?.items ?? []

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="t-section-title">Pending Join Requests</h2>
        <span className="text-[11px] text-muted font-mono">{requests.length}</span>
      </div>

      {requests.length === 0 && (
        <p className="text-sm text-muted text-center py-4">No pending requests.</p>
      )}

      {requests.map(req => (
        <div key={req.id} className="flex items-center justify-between py-2 border-b border-subtle last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <UserAvatar
              user={{ id: req.user_id, display_name: req.display_name ?? undefined, avatar_url: req.avatar_url }}
              size={24}
              variant="brass"
              className="shrink-0"
              linkToProfile
            />
            <div className="min-w-0">
              <p className="text-sm text-secondary truncate">{req.display_name ?? 'Member'}</p>
              <p className="text-[10px] text-muted font-mono">
                {formatDate(req.created_at, prefs)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => decideMutation.mutate({ requestId: req.id, decision: 'approved' })}
              disabled={decideMutation.isPending}
              className="p-1.5 rounded border border-[var(--success-text)]/30 text-[var(--success-text)] hover:bg-[var(--success-text)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Approve"
              aria-label={`Approve ${req.display_name ?? 'request'}`}
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => decideMutation.mutate({ requestId: req.id, decision: 'rejected' })}
              disabled={decideMutation.isPending}
              className="p-1.5 rounded border border-[var(--error-text)]/30 text-[var(--error-text)] hover:bg-[var(--error-text)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reject"
              aria-label={`Reject ${req.display_name ?? 'request'}`}
            >
              <XIcon size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Members Section
// ---------------------------------------------------------------------------

function MembersSection({ clubId, currentUserId }: { clubId: string; currentUserId: string }) {
  const queryClient = useQueryClient()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmRole, setConfirmRole] = useState<{ userId: string; displayName: string; promote: boolean } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['club', clubId, 'members'],
    queryFn: () => clubsApi.listMembers(clubId),
  })

  const { data: permissionData } = useQuery({
    queryKey: ['club', clubId, 'moderator-permissions'],
    queryFn: () => clubsApi.getModeratorPermissions(clubId),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => clubsApi.removeMember(clubId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast('Member removed', 'success')
    },
    onError: () => toast('Failed to remove member', 'error'),
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, isModerator }: { userId: string; isModerator: boolean }) =>
      clubsApi.updateMember(clubId, userId, { is_moderator: isModerator }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      toast('Role updated', 'success')
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Failed to update role'
      toast(msg, 'error')
    },
  })

  const permissionMutation = useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: string[] }) =>
      clubsApi.updateMember(clubId, userId, { permissions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      toast('Permissions updated', 'success')
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to update permissions', 'error')
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
    },
  })

  const members = data?.items ?? []
  const moderatorCount = members.filter(m => m.is_moderator).length
  const catalogue = permissionData?.catalogue ?? []
  const viewerRole = permissionData?.role ?? null
  const canDelegate = can(viewerRole, PERM.manageModerators)
  // Owners delegate anything; a moderator may only pass on what they hold.
  const grantable = viewerRole?.is_owner ? null : (viewerRole?.permissions ?? [])

  const togglePermission = (member: ClubMember, key: string, next: boolean) => {
    const current = member.permissions ?? []
    const permissions = next ? [...current, key] : current.filter(p => p !== key)
    permissionMutation.mutate({ userId: member.user_id, permissions })
  }

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h2 className="t-section-title">Members</h2>
        <span className="text-[11px] text-muted font-mono">{members.length}</span>
      </div>
      <p className="text-[10px] text-muted -mt-2">
        Promote a moderator to help run the club, then choose exactly what they
        can do. The owner always holds every capability.
      </p>

      {members.map((member: ClubMember) => {
        const lastModerator = member.is_moderator && moderatorCount <= 1
        const showPermissions = member.is_moderator && !member.is_owner && expanded === member.user_id
        return (
          <div key={member.user_id} className="py-2 border-b border-subtle last:border-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserAvatar
                  user={{ id: member.user_id, display_name: member.display_name, avatar_url: member.avatar_url }}
                  size={24}
                  variant="brass"
                  linkToProfile
                />
                <span className="text-sm text-secondary">{member.display_name}</span>
                <RoleBadge member={member} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted font-mono">
                  {member.joined_at.slice(0, 10)}
                </span>
                {member.user_id !== currentUserId && !member.is_owner && (
                  <>
                    {canDelegate && (
                      <button
                        onClick={() => setConfirmRole({
                          userId: member.user_id,
                          displayName: member.display_name,
                          promote: !member.is_moderator,
                        })}
                        disabled={roleMutation.isPending || lastModerator}
                        className="p-1 rounded text-muted hover:text-[var(--brass)] hover:bg-[var(--brass)]/10 transition-colors disabled:opacity-30"
                        title={lastModerator ? 'Cannot demote the last moderator' : member.is_moderator ? 'Demote to member' : 'Promote to moderator'}
                      >
                        {member.is_moderator ? <ShieldOff size={14} /> : <Shield size={14} />}
                      </button>
                    )}
                    {!member.is_moderator && (
                      <button
                        onClick={() => setConfirmRemove(member.user_id)}
                        disabled={removeMutation.isPending}
                        className="p-1 rounded text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove member"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {member.is_owner && (
              <p className="text-[10px] text-muted mt-1">Full access — the owner's role cannot be changed.</p>
            )}

            {member.is_moderator && !member.is_owner && (
              <div className="mt-1">
                <PermissionSummary
                  permissions={member.permissions}
                  catalogue={catalogue}
                  open={showPermissions}
                  onToggle={() => setExpanded(showPermissions ? null : member.user_id)}
                />
                {showPermissions && (
                  <ModeratorPermissionEditor
                    catalogue={catalogue}
                    granted={member.permissions ?? []}
                    grantable={grantable}
                    disabled={!canDelegate || permissionMutation.isPending}
                    onToggle={(key, next) => togglePermission(member, key, next)}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove member?"
        message="This member will be removed from the club."
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirmRemove) removeMutation.mutate(confirmRemove)
          setConfirmRemove(null)
        }}
        onCancel={() => setConfirmRemove(null)}
      />

      <ConfirmDialog
        open={!!confirmRole}
        title={confirmRole?.promote ? 'Promote to moderator?' : 'Demote to member?'}
        message={confirmRole?.promote
          ? `${confirmRole.displayName} will start with the day-to-day permissions. You can change exactly what they can do afterwards.`
          : `${confirmRole?.displayName} will no longer help run the club, and their permissions will be cleared.`}
        confirmLabel={confirmRole?.promote ? 'Promote' : 'Demote'}
        onConfirm={() => {
          if (confirmRole) roleMutation.mutate({ userId: confirmRole.userId, isModerator: confirmRole.promote })
          setConfirmRole(null)
        }}
        onCancel={() => setConfirmRole(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Leave Club Section
// ---------------------------------------------------------------------------

function LeaveSection({ clubId, club, members, currentUserId }: { clubId: string; club: Club; members: ClubMember[]; currentUserId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const currentMember = members.find(m => m.user_id === currentUserId)
  const moderatorCount = members.filter(m => m.is_moderator).length
  const isLastModerator = currentMember?.is_moderator && moderatorCount <= 1
  // Deleting the club is the one capability the owner never delegates.
  const isOwner = !!currentMember?.is_owner

  const leaveMutation = useMutation({
    mutationFn: () => clubsApi.leave(clubId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Left club', 'success')
      navigate({ to: '/clubs' })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Failed to leave club'
      toast(msg, 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => clubsApi.remove(clubId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Club deleted', 'success')
      navigate({ to: '/clubs' })
    },
    onError: (err) => toast(updateErrorMessage(err, 'Failed to delete club'), 'error'),
  })

  return (
    <div className={sectionCls}>
      <h2 className="t-section-title">Danger Zone</h2>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-secondary">Leave this club</p>
          {isLastModerator && (
            <p className="text-[11px] text-muted">Promote another member to moderator first.</p>
          )}
        </div>
        <button
          onClick={() => setConfirmLeave(true)}
          disabled={!!isLastModerator || leaveMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-widest uppercase border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors disabled:opacity-30"
        >
          <LogOut size={12} />
          Leave
        </button>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-subtle">
        <div>
          <p className="text-sm text-secondary">Delete this club</p>
          <p className="text-[11px] text-muted">
            Removes the club, its members, posts and opening times. Leagues stay but are no longer club-hosted.
            {!isOwner && ' Only the club owner can do this.'}
          </p>
        </div>
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={!isOwner || deleteMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-widest uppercase border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors disabled:opacity-30 shrink-0"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave club?"
        message="You will no longer be a member of this club. You can rejoin later."
        confirmLabel="Leave"
        onConfirm={() => { setConfirmLeave(false); leaveMutation.mutate() }}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${club.name}?`}
        message={`This permanently removes the club and its ${members.length} member${members.length === 1 ? '' : 's'}, posts and opening times. This cannot be undone.`}
        confirmLabel="Delete club"
        onConfirm={() => { setConfirmDelete(false); deleteMutation.mutate() }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ClubSettings() {
  const { id } = useParams({ from: '/app/clubs/$id/settings' })
  const navigate = useNavigate()
  const currentUser = useAuthStore(s => s.user)

  const { data: club, isLoading: clubLoading } = useQuery({
    queryKey: ['club', id],
    queryFn: () => clubsApi.get(id),
  })

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['club', id, 'members'],
    queryFn: () => clubsApi.listMembers(id),
    enabled: !!club?.is_member,
  })

  const isLoading = clubLoading || membersLoading
  const { data: permissionData } = useQuery({
    queryKey: ['club', id, 'moderator-permissions'],
    queryFn: () => clubsApi.getModeratorPermissions(id),
  })

  const isModerator = club?.is_moderator ?? false

  useEffect(() => {
    if (!isLoading && !isModerator) {
      navigate({ to: '/clubs/$id', params: { id } })
    }
  }, [isLoading, isModerator, navigate, id])

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-4 max-w-lg lg:max-w-3xl mx-auto">
        <div className="h-6 w-40 skeleton rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 skeleton rounded" />
        ))}
      </div>
    )
  }

  if (!club) {
    return (
      <div className="p-4 text-center py-16">
        <p className="text-red-400 text-sm">Club not found.</p>
        <Link to="/clubs" className="block mt-4 text-[11px] tracking-widest uppercase text-[var(--brass)]">Back</Link>
      </div>
    )
  }

  // currentUser can briefly be null while the persisted auth store settles, and
  // is null outright once a session expires — render nothing rather than
  // dereferencing it.
  if (!isModerator || !currentUser) return null

  const members = membersData?.items ?? []

  return (
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/clubs/$id" params={{ id }} className="text-muted hover:text-secondary transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="t-page-title">Club Settings</h1>
      </div>

      <p className="text-xs text-muted">{club.name}</p>

      <ClubImageSection clubId={id} club={club} />
      <GeneralInfoSection clubId={id} club={club} />
      <LocationContactSection clubId={id} club={club} />
      <OpeningHoursSection clubId={id} />
      <DisciplinesSection clubId={id} club={club} />
      <MembershipInfoSection clubId={id} club={club} />
      <PrivacySection clubId={id} club={club} />
      <RegionalSection clubId={id} club={club} />
      {club.join_policy === 'approval' && <JoinRequestsSection clubId={id} />}
      <MembersSection clubId={id} currentUserId={currentUser.id} />

      <div className={sectionCls}>
        <h2 className={labelCls}>Announcements</h2>
        <AnnouncementComposer
          scope="club"
          scopeId={id}
          audienceLabel={`every member of ${club.name}`}
          canSend={can(permissionData?.role, PERM.sendAnnouncements)}
        />
      </div>

      <LeaveSection clubId={id} club={club} members={members} currentUserId={currentUser.id} />
    </div>
  )
}
