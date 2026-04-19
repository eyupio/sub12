import { useState, useMemo, useRef } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Camera, Loader2, MapPin, Target, Crosshair, CheckCircle2 } from 'lucide-react'
import { gearApi } from '../api/gear'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { scoreCardApi } from '../api/scoreCards'
import { pelletTestApi } from '../api/pelletTesting'
import { ChipSelector } from '../components/ChipSelector'
import { toast } from '../store/toast'

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

function Section({ title, required, children }: { title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] tracking-widest uppercase text-muted flex items-center gap-2">
        {title}
        {required && <span className="text-[var(--brass)] text-xs">*</span>}
      </h2>
      {children}
    </section>
  )
}

export default function QuickCapture() {
  const navigate = useNavigate()
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
  const [wind, setWind] = useState<number | null>(null)
  const [temp, setTemp] = useState<number | null>(null)
  const [location, setLocation] = useState<string>('')
  const [locating, setLocating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  // Surface recent locations from the user's last few entries so the field
  // reduces to a tap rather than typing. Pulled from pellet tests and score
  // cards lists opportunistically.
  const { data: recentPellet } = useQuery({
    queryKey: ['pellet-tests-recent'],
    queryFn: () => pelletTestApi.list(10, 0),
  })
  const { data: recentScore } = useQuery({
    queryKey: ['score-cards-recent'],
    queryFn: () => scoreCardApi.list(10, 0),
  })
  const recentLocations = useMemo(() => {
    const buckets = new Set<string>()
    recentPellet?.items.forEach((s) => s.location && buckets.add(s.location))
    recentScore?.items.forEach((s) => s.location && buckets.add(s.location))
    return Array.from(buckets).slice(0, 4)
  }, [recentPellet, recentScore])

  function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) {
      toast('Photo must be under 10 MB', 'error')
      return
    }
    setPhoto(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast('Geolocation unavailable on this device', 'error')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Coarse label — no external reverse geocoder required. The user
        // can edit this later during refinement.
        setLocation(`${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`)
        setLocating(false)
      },
      () => {
        toast("Couldn't get location — skip or type it in", 'error')
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60_000 },
    )
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
          location: location || undefined,
          wind_mph: wind ?? undefined,
          temp_celsius: temp ?? undefined,
        })
        await pelletTestApi.uploadImage(session.id, photo)
        return { id: session.id, kind: 'pellet' as const }
      }

      const card = await scoreCardApi.quickCreate({
        rifle_id: rifleId,
        pellet_id: pelletId,
        location: location || undefined,
        wind_mph: wind ?? undefined,
        temp_celsius: temp ?? undefined,
        league_round_id: undefined, // round is selected during refinement — reduces friction at capture
        club_id: context === 'club' ? clubId ?? undefined : undefined,
      })
      await scoreCardApi.uploadImage(card.id, photo)

      // If the user chose a league up front, stash it on the draft via PATCH
      // with visibility hint only — the actual round is bound at refinement
      // via ensure-round. Keeping capture fast means we don't block on the
      // round-ensure network hop here.
      if (context === 'league' && leagueId) {
        try {
          const round = await leagueApi.ensureDefaultRound(leagueId)
          await scoreCardApi.update(card.id, {
            shot_at: card.shot_at,
            shot_scores: card.shot_scores,
            shot_xs: card.shot_xs,
            league_round_id: round.round_id,
            rifle_id: card.rifle_id,
            pellet_id: card.pellet_id,
          })
        } catch {
          // Non-fatal — the draft is saved and the user can re-bind at refine time.
        }
      }

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

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-medium tracking-wide">Quick capture</h1>
        <p className="text-sm text-muted">
          Snap it now, refine later. Only the essentials — no typing unless you want to.
        </p>
      </header>

      <Section title="Type">
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
      </Section>

      {type === 'score' && (
        <Section title="Context">
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
            <ChipSelector<string>
              ariaLabel="League"
              value={leagueId}
              onChange={setLeagueId}
              options={myLeagues.items.map((l) => ({ value: l.id, label: l.name }))}
            />
          )}
          {context === 'club' && myClubs && (
            <ChipSelector<string>
              ariaLabel="Club"
              value={clubId}
              onChange={setClubId}
              options={myClubs.items.map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
        </Section>
      )}

      <Section title="Rifle" required>
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
                    ? 'rounded-lg border-2 border-[var(--brass)] bg-[var(--brass)]/10 p-3 text-left'
                    : 'rounded-lg border border-subtle bg-surface p-3 text-left hover:border-[var(--brass)]/40 transition-colors'
                }
              >
                <div className="text-sm font-medium tracking-wide text-primary truncate">{r.make}</div>
                <div className="text-xs text-muted truncate">{r.model}</div>
                {r.calibre && <div className="text-[11px] text-muted mt-1">{r.calibre}</div>}
              </button>
            )
          })}
          {rifles.length === 0 && (
            <div className="col-span-full text-sm text-muted italic p-3">
              No rifles yet — add one in Gear before saving a quick capture.
            </div>
          )}
        </div>
      </Section>

      <Section title="Pellet" required>
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
                    ? 'rounded-lg border-2 border-[var(--brass)] bg-[var(--brass)]/10 p-3 text-left'
                    : 'rounded-lg border border-subtle bg-surface p-3 text-left hover:border-[var(--brass)]/40 transition-colors'
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
          {pellets.length === 0 && (
            <div className="col-span-full text-sm text-muted italic p-3">
              No pellets yet — add one in Gear before saving a quick capture.
            </div>
          )}
        </div>
      </Section>

      <Section title="Photo" required>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFile}
          className="hidden"
        />
        {photoPreview ? (
          <div className="relative rounded-lg overflow-hidden border border-subtle">
            <img src={photoPreview} alt="" className="w-full max-h-80 object-contain bg-black" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-2 right-2 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs tracking-wide"
            >
              Retake
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-40 rounded-lg border-2 border-dashed border-subtle flex flex-col items-center justify-center gap-2 text-muted hover:border-[var(--brass)]/50 hover:text-[var(--brass)] transition-colors"
          >
            <Camera size={28} />
            <span className="text-sm tracking-wide">Take photo</span>
          </button>
        )}
      </Section>

      <Section title="Conditions (optional)">
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted mb-1.5">Wind</div>
            <ChipSelector<number>
              ariaLabel="Wind"
              value={wind}
              onChange={setWind}
              options={WIND_CHIPS}
            />
          </div>
          <div>
            <div className="text-xs text-muted mb-1.5">Temperature</div>
            <ChipSelector<number>
              ariaLabel="Temperature"
              value={temp}
              onChange={setTemp}
              options={TEMP_CHIPS}
            />
          </div>
        </div>
      </Section>

      <Section title="Location (optional)">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="px-4 py-2 rounded-full border border-subtle bg-surface text-sm tracking-wide hover:border-[var(--brass)]/40 transition-colors flex items-center gap-1.5 disabled:opacity-60"
          >
            {locating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
            Use current
          </button>
          {recentLocations.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => setLocation(location === loc ? '' : loc)}
              className={
                location === loc
                  ? 'px-4 py-2 rounded-full border text-sm tracking-wide bg-[var(--brass)]/15 border-[var(--brass)] text-[var(--brass)]'
                  : 'px-4 py-2 rounded-full border border-subtle bg-surface text-sm tracking-wide hover:border-[var(--brass)]/40 transition-colors'
              }
            >
              {loc}
            </button>
          ))}
        </div>
        {location && (
          <p className="text-xs text-muted mt-2">Location: <span className="text-secondary">{location}</span></p>
        )}
      </Section>

      <div className="sticky bottom-[calc(var(--mobile-nav-offset)+0.5rem)] lg:bottom-4 flex gap-2">
        <button
          type="button"
          onClick={() => navigate({ to: '/' })}
          className="px-5 py-3 rounded-lg border border-subtle text-secondary text-sm tracking-wide bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => save.mutate()}
          className="flex-1 px-5 py-3 rounded-lg bg-[var(--brass)] text-black font-medium tracking-wide text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Save draft
        </button>
      </div>
    </div>
  )
}
