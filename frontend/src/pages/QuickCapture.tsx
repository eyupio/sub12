import { useState, useRef } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Camera, CheckCircle2, ChevronLeft, Crosshair, Loader2, Target, Upload, X } from 'lucide-react'
import { gearApi } from '../api/gear'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { scoreCardApi } from '../api/scoreCards'
import { pelletTestApi } from '../api/pelletTesting'
import { ChipSelector } from '../components/ChipSelector'
import { ImageEditor } from '../components/ImageEditor'
import { LocationField, type LocationValue } from '../components/LocationField'
import { toast } from '../store/toast'
import { useSmartBack } from '../hooks/useSmartBack'
import { captureImageOrClick } from '../utils/imagePicker'

type CaptureType = 'score' | 'pellet'
type Context = 'personal' | 'league' | 'club'

const WIND_CHIPS = [
  { value: 0, label: 'Calm', hint: '0 mph' },
  { value: 5, label: 'Light', hint: '~5 mph' },
  { value: 12, label: 'Breezy', hint: '~12 mph' },
  { value: 20, label: 'Gusty', hint: '~20 mph' },
]

const TEMP_CHIPS = [
  { value: -5, label: 'Cold', hint: '~-5°C' },
  { value: 10, label: 'Mild', hint: '~10°C' },
  { value: 20, label: 'Warm', hint: '~20°C' },
  { value: 28, label: 'Hot', hint: '~28°C' },
]

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2 text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50'

export default function QuickCapture() {
  const navigate = useNavigate()
  const smartBack = useSmartBack('/')
  const search = useSearch({ strict: false }) as {
    type?: CaptureType
    leagueId?: string
    clubId?: string
  }

  const [type, setType] = useState<CaptureType>(search.type ?? 'score')
  const initialContext: Context = search.leagueId ? 'league' : search.clubId ? 'club' : 'personal'
  const [context, setContext] = useState<Context>(initialContext)
  const [leagueId, setLeagueId] = useState<string | null>(search.leagueId ?? null)
  const [clubId, setClubId] = useState<string | null>(search.clubId ?? null)
  const [rifleId, setRifleId] = useState<string | null>(null)
  const [pelletId, setPelletId] = useState<string | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [editingFile, setEditingFile] = useState<File | null>(null)
  const [wind, setWind] = useState<number | null>(null)
  const [temp, setTemp] = useState<number | null>(null)
  const [location, setLocation] = useState<LocationValue>({ label: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const { data: rifleData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: pelletData } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const { data: myLeagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: type === 'score' && context === 'league',
  })
  const { data: myClubs } = useQuery({
    queryKey: ['my-clubs'],
    queryFn: () => clubsApi.listMine(),
    enabled: type === 'score' && context === 'club',
  })

  const rifles = rifleData?.items ?? []
  const pellets = pelletData?.items ?? []

  function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f) return
    setEditingFile(f)
  }

  function onEdited(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast('Photo must be under 10 MB', 'error')
      return
    }
    setPhoto(f)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(URL.createObjectURL(f))
    setEditingFile(null)
  }

  function clearPhoto() {
    setPhoto(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
  }

  function startEditExisting() {
    if (photo) setEditingFile(photo)
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!rifleId) throw new Error('Pick a rifle')
      if (!pelletId) throw new Error('Pick a pellet')
      if (!photo) throw new Error('Add a photo')

      if (type === 'pellet') {
        const session = await pelletTestApi.quickCreate({
          rifle_id: rifleId,
          pellet_id: pelletId,
          location: location.label || undefined,
          location_lat: location.lat,
          location_lng: location.lng,
          wind_mph: wind ?? undefined,
          temp_celsius: temp ?? undefined,
        })
        await pelletTestApi.uploadImage(session.id, photo)
        return { id: session.id, kind: 'pellet' as const }
      }

      // Resolve the league round up front: the score_cards Update endpoint
      // does not accept league_round_id, so binding has to land on the INSERT.
      let leagueRoundId: string | undefined
      if (context === 'league' && leagueId) {
        const round = await leagueApi.ensureDefaultRound(leagueId)
        leagueRoundId = round.round_id
      }

      const card = await scoreCardApi.quickCreate({
        rifle_id: rifleId,
        pellet_id: pelletId,
        location: location.label || undefined,
        location_lat: location.lat,
        location_lng: location.lng,
        wind_mph: wind ?? undefined,
        temp_celsius: temp ?? undefined,
        league_round_id: leagueRoundId,
        club_id: context === 'club' ? clubId ?? undefined : undefined,
      })
      await scoreCardApi.uploadImage(card.id, photo)

      return { id: card.id, kind: 'score' as const }
    },
    onSuccess: () => {
      toast('Draft saved — refine it later from Drafts', 'success')
      navigate({ to: '/drafts' })
    },
    onError: (err: Error) => {
      toast(err.message ?? 'Failed to save draft', 'error')
    },
  })

  const canSave = Boolean(rifleId && pelletId && photo) && !save.isPending
  const sidebarLabelCls = 't-section-title'

  return (
    <div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-6xl mx-auto pb-24">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={smartBack}
          aria-label="Back"
          className="flex items-center gap-1.5 t-section-title hover:text-secondary transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>
      </div>

      {/* Hero */}
      <div className="rounded-lg border border-subtle bg-surface px-5 py-5 lg:px-6 lg:py-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-3 min-w-0">
            <div className="flex items-baseline gap-3 font-mono">
              <h1 className="t-page-title">Quick Capture</h1>
            </div>
            <p className="text-sm text-muted">Snap it now, refine later. Only the essentials.</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded bg-surface-hover text-muted">
                {type === 'score' ? 'Score card' : 'Pellet test'}
              </span>
              {context !== 'personal' && type === 'score' && (
                <span className="text-[10px] tracking-widest uppercase text-[var(--brass)] bg-[var(--brass)]/10 px-2 py-0.5 rounded">
                  {context}
                </span>
              )}
            </div>
          </div>
          {(rifleId || pelletId) && (
            <div className="flex items-center gap-4 shrink-0 font-mono">
              {rifleId && (
                <div className="text-right">
                  <p className="text-[10px] tracking-widest uppercase text-muted">Rifle</p>
                  <p className="text-sm text-primary font-semibold">
                    {rifles.find(r => r.id === rifleId)?.make ?? '—'}
                  </p>
                </div>
              )}
              {pelletId && (
                <div className="text-right">
                  <p className="text-[10px] tracking-widest uppercase text-muted">Pellet</p>
                  <p className="text-sm text-primary font-semibold">
                    {pellets.find(p => p.id === pelletId)?.brand ?? '—'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-5 space-y-5 lg:space-y-0">
        {/* Main panel: Photo + Rifle + Pellet */}
        <div className="lg:col-span-2 space-y-4">
          {/* Photo */}
          <div className="rounded-lg border border-subtle bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-subtle pb-2">
              <span className="text-[11px] tracking-widest uppercase text-[var(--brass)] border-b-2 border-[var(--brass)] pb-1 -mb-[9px]">
                Photo <span className="text-[var(--brass)]">*</span>
              </span>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
            {photoPreview ? (
              <div className="relative rounded border border-subtle overflow-hidden">
                <img src={photoPreview} alt="Captured photo" className="w-full max-h-72 object-contain bg-black/5" />
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="tap-target absolute top-2 right-2 bg-page/80 backdrop-blur rounded-full p-1 text-muted hover:text-primary transition-colors"
                  aria-label="Remove photo"
                >
                  <X size={16} />
                </button>
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <button
                    type="button"
                    onClick={startEditExisting}
                    className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs tracking-wide"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => captureImageOrClick('camera', cameraRef, setEditingFile)}
                    className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs tracking-wide"
                  >
                    Retake
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => captureImageOrClick('camera', cameraRef, setEditingFile)}
                  className="flex-1 h-36 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-subtle rounded text-muted hover:border-[var(--brass)]/50 hover:text-[var(--brass)] transition-colors"
                >
                  <Camera size={24} />
                  <span className="text-sm tracking-wide">Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => captureImageOrClick('photos', fileRef, setEditingFile)}
                  className="flex-1 h-36 flex flex-col items-center justify-center gap-2 border border-dashed border-subtle rounded text-muted hover:border-[var(--brass)]/50 hover:text-secondary transition-colors"
                >
                  <Upload size={20} />
                  <span className="text-sm tracking-wide">Upload</span>
                </button>
              </div>
            )}
          </div>

          {/* Rifle */}
          <div className="rounded-lg border border-subtle bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-subtle pb-2">
              <span className="text-[11px] tracking-widest uppercase text-[var(--brass)] border-b-2 border-[var(--brass)] pb-1 -mb-[9px]">
                Rifle <span className="text-[var(--brass)]">*</span>
              </span>
            </div>
            {rifles.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {rifles.map((r) => {
                  const active = rifleId === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRifleId(active ? null : r.id)}
                      className={
                        active
                          ? 'rounded-lg border-2 border-[var(--brass)] bg-[var(--brass)]/10 p-3 text-left transition-colors'
                          : 'rounded-lg border border-subtle bg-surface-hover p-3 text-left hover:border-[var(--brass)]/40 transition-colors'
                      }
                    >
                      <div className="text-sm font-medium tracking-wide text-primary truncate">{r.make}</div>
                      <div className="text-xs text-muted truncate">{r.model}</div>
                      {r.calibre && <div className="text-[11px] text-muted mt-1">{r.calibre}</div>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted italic">No rifles yet — add one in Gear before saving a quick capture.</p>
            )}
          </div>

          {/* Pellet */}
          <div className="rounded-lg border border-subtle bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-subtle pb-2">
              <span className="text-[11px] tracking-widest uppercase text-[var(--brass)] border-b-2 border-[var(--brass)] pb-1 -mb-[9px]">
                Pellet <span className="text-[var(--brass)]">*</span>
              </span>
            </div>
            {pellets.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {pellets.map((p) => {
                  const active = pelletId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPelletId(active ? null : p.id)}
                      className={
                        active
                          ? 'rounded-lg border-2 border-[var(--brass)] bg-[var(--brass)]/10 p-3 text-left transition-colors'
                          : 'rounded-lg border border-subtle bg-surface-hover p-3 text-left hover:border-[var(--brass)]/40 transition-colors'
                      }
                    >
                      <div className="text-sm font-medium tracking-wide text-primary truncate">{p.brand}</div>
                      <div className="text-xs text-muted truncate">{p.model}</div>
                      {p.weight_grains && (
                        <div className="text-[11px] text-muted mt-1">{p.weight_grains} gr</div>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted italic">No pellets yet — add one in Gear before saving a quick capture.</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Type */}
          <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
            <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Type</p>
            <ChipSelector<CaptureType>
              ariaLabel="Capture type"
              value={type}
              allowClear={false}
              onChange={(v) => v && setType(v)}
              options={[
                { value: 'score', label: 'Score card', icon: <Target size={14} /> },
                { value: 'pellet', label: 'Pellet test', icon: <Crosshair size={14} /> },
              ]}
            />
          </div>

          {/* Context (score only) */}
          {type === 'score' && (
            <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
              <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Context</p>
              <ChipSelector<Context>
                ariaLabel="Context"
                value={context}
                allowClear={false}
                onChange={(v) => {
                  if (!v) return
                  setContext(v)
                  if (v === 'personal') {
                    setLeagueId(null)
                    setClubId(null)
                  }
                }}
                options={[
                  { value: 'personal', label: 'Personal' },
                  { value: 'league', label: 'League' },
                  { value: 'club', label: 'Club' },
                ]}
              />
              {context === 'league' && myLeagues && (
                <div className="pt-1">
                  <select
                    value={leagueId ?? ''}
                    onChange={e => setLeagueId(e.target.value || null)}
                    className={inputCls}
                  >
                    <option value="">Select league…</option>
                    {myLeagues.items.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {context === 'club' && myClubs && (
                <div className="pt-1">
                  <select
                    value={clubId ?? ''}
                    onChange={e => setClubId(e.target.value || null)}
                    className={inputCls}
                  >
                    <option value="">Select club…</option>
                    {myClubs.items.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Conditions */}
          <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
            <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Conditions</p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted mb-1.5">Wind</p>
                <ChipSelector<number>
                  ariaLabel="Wind"
                  value={wind}
                  onChange={setWind}
                  options={WIND_CHIPS}
                />
              </div>
              <div>
                <p className="text-xs text-muted mb-1.5">Temperature</p>
                <ChipSelector<number>
                  ariaLabel="Temperature"
                  value={temp}
                  onChange={setTemp}
                  options={TEMP_CHIPS}
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
            <p className={`${sidebarLabelCls} border-b border-subtle pb-2`}>Location</p>
            <LocationField
              value={location}
              onChange={setLocation}
              showLabelInput={false}
              inputClassName={`${inputCls} placeholder:text-muted`}
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="space-y-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => save.mutate()}
          className="w-full py-3 rounded font-medium tracking-widest uppercase text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--brass)] text-inverse hover:opacity-90 flex items-center justify-center gap-2"
        >
          {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {save.isPending ? 'Saving…' : 'Save Draft'}
        </button>
        {!canSave && !save.isPending && (
          <p className="text-center text-xs text-muted tracking-wide">
            {!rifleId ? 'Select a rifle to continue.'
              : !pelletId ? 'Select a pellet to continue.'
              : 'Add a photo to save your draft.'}
          </p>
        )}
      </div>

      {editingFile && (
        <ImageEditor
          file={editingFile}
          onSave={onEdited}
          onCancel={() => setEditingFile(null)}
        />
      )}
    </div>
  )
}