import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { categoriesApi } from '../api/categories'
import { eventsApi, type CreateEventPayload, type EventVisibility } from '../api/events'
import { customPreset, disciplinePresets } from '../config/disciplinePresets'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { PageGrid, PageHeader, Section } from '../components/leagues'
import { toast } from '../store/toast'

function parseLaneList(input: string): number[] {
  if (!input.trim()) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const part of input.split(/[,\s]+/g)) {
    if (!part) continue
    const n = Number.parseInt(part, 10)
    if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out.sort((a, b) => a - b)
}

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors'

function toggleCls(active: boolean) {
  return `px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors ${
    active
      ? 'border-[var(--gold)]/50 bg-[var(--gold-tint)] text-[var(--gold)]'
      : 'border-subtle text-muted hover:text-secondary'
  }`
}

export default function EventCreate() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/events/new' as never }) as { clubId?: string }
  const clubId = search.clubId

  const [presetId, setPresetId] = useState(disciplinePresets[0].id)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [discipline, setDiscipline] = useState(disciplinePresets[0].discipline)
  const [lanes, setLanes] = useState(disciplinePresets[0].course.lanes)
  const [shotsPerTarget, setShotsPerTarget] = useState(disciplinePresets[0].course.shots_per_target)
  const [standing, setStanding] = useState('')
  const [kneeling, setKneeling] = useState('')
  const [visibility, setVisibility] = useState<EventVisibility>(clubId ? 'club_only' : 'public')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [error, setError] = useState('')

  // If the user navigated from a club, default visibility to club_only.
  useEffect(() => {
    if (clubId) setVisibility('club_only')
  }, [clubId])

  const { data: catsData } = useQuery({
    queryKey: ['categories', 'public'],
    queryFn: () => categoriesApi.listPublic(),
  })
  const categories = catsData?.items ?? []

  const preset = useMemo(
    () => disciplinePresets.find((p) => p.id === presetId) ?? customPreset,
    [presetId],
  )

  function applyPreset(id: string) {
    setPresetId(id)
    const p = disciplinePresets.find((x) => x.id === id) ?? customPreset
    setDiscipline(p.discipline)
    setLanes(p.course.lanes)
    setShotsPerTarget(p.course.shots_per_target)
    setStanding('')
    setKneeling('')
  }

  const create = useMutation({
    mutationFn: (body: CreateEventPayload) => eventsApi.create(body),
    onSuccess: (ev) => {
      toast('Event created', 'success')
      if (clubId) {
        navigate({ to: '/clubs/$id', params: { id: clubId } })
      } else {
        navigate({ to: '/events/$slug', params: { slug: ev.slug } })
      }
    },
    onError: (err) => setError(String(err instanceof Error ? err.message : err)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (lanes < 1 || lanes > 200) {
      setError('Lanes must be between 1 and 200')
      return
    }
    create.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      discipline,
      course: {
        lanes,
        shots_per_target: shotsPerTarget,
        standing_targets: parseLaneList(standing),
        kneeling_targets: parseLaneList(kneeling),
      },
      scoring_rules: preset.scoringRules,
      category_ids: selectedCategoryIds,
      visibility,
      club_id: clubId,
    })
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    )
  }

  return (
    <PageGrid>
      <PageHeader
        title="New Event"
        info={<HelpIcon content={pageHelp.eventCreate} />}
        description={
          clubId
            ? 'Hosting on behalf of your club. Visibility defaults to club only.'
            : 'Pick a discipline, course, and categories. Visibility controls who can find or join it.'
        }
      />

      <form onSubmit={onSubmit}>
        <div className="lc-stack">
          <Section title="Basics">
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  placeholder="Spring HFT shoot"
                  autoFocus
                />
              </Field>
              <Field label="Description (optional)">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${inputCls} resize-none`}
                  rows={2}
                />
              </Field>
              <Field label="Location (optional)">
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. North field range"
                />
              </Field>
            </div>
          </Section>

          <Section title="Discipline & Course">
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Discipline preset">
                <div className="flex flex-wrap gap-2">
                  {[...disciplinePresets, customPreset].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className={toggleCls(presetId === p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Discipline">
                  <input
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    className={inputCls}
                    placeholder="HFT, FT, …"
                  />
                </Field>
                <Field label="Lanes">
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={lanes}
                    onChange={(e) => setLanes(Number.parseInt(e.target.value || '0', 10))}
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Shots per target">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={shotsPerTarget}
                  onChange={(e) => setShotsPerTarget(Number.parseInt(e.target.value || '0', 10))}
                  className={inputCls}
                />
              </Field>

              <Field label="Standing lanes (optional)">
                <input
                  value={standing}
                  onChange={(e) => setStanding(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 1, 4, 5"
                  inputMode="text"
                />
              </Field>

              <Field label="Kneeling lanes (optional)">
                <input
                  value={kneeling}
                  onChange={(e) => setKneeling(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 7, 12"
                  inputMode="text"
                />
              </Field>
            </div>
          </Section>

          <Section title="Categories & Visibility">
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Categories">
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategory(c.id)}
                      className={toggleCls(selectedCategoryIds.includes(c.id))}
                    >
                      {c.label}
                    </button>
                  ))}
                  {categories.length === 0 && (
                    <p className="text-xs text-muted">No categories available.</p>
                  )}
                </div>
              </Field>

              <Field label="Visibility">
                <div className="flex gap-2">
                  {(['public', 'club_only', 'unlisted'] as EventVisibility[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisibility(v)}
                      className={`${toggleCls(visibility === v)} flex-1`}
                    >
                      {v === 'public' ? 'Public' : v === 'club_only' ? 'Club only' : 'Unlisted'}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          {error && <p style={{ color: 'var(--error-text)', fontSize: 13 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={create.isPending}
              className="bg-[var(--gold)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase px-5 py-3 rounded transition-opacity"
            >
              {create.isPending ? 'Creating…' : 'Create event'}
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: clubId ? '/clubs/$id' : '/events', params: clubId ? { id: clubId } : undefined as never })}
              className="lc-action-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </PageGrid>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="t-section-title block mb-1.5">{label}</span>
      {children}
    </label>
  )
}
