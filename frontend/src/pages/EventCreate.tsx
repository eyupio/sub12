import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { categoriesApi } from '../api/categories'
import { eventsApi, type CreateEventPayload, type EventVisibility } from '../api/events'
import { customPreset, disciplinePresets } from '../config/disciplinePresets'
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

export default function EventCreate() {
  const navigate = useNavigate()
  const [presetId, setPresetId] = useState(disciplinePresets[0].id)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [discipline, setDiscipline] = useState(disciplinePresets[0].discipline)
  const [lanes, setLanes] = useState(disciplinePresets[0].course.lanes)
  const [shotsPerTarget, setShotsPerTarget] = useState(disciplinePresets[0].course.shots_per_target)
  const [standing, setStanding] = useState('')
  const [kneeling, setKneeling] = useState('')
  const [visibility, setVisibility] = useState<EventVisibility>('public')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [error, setError] = useState('')

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
      navigate({ to: '/events/$slug', params: { slug: ev.slug } })
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
    })
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-5">New live event</h1>

      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-subtle bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Spring HFT shoot"
            autoFocus
          />
        </Field>

        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-subtle bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
          />
        </Field>

        <Field label="Location (optional)">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-md border border-subtle bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. North field range"
          />
        </Field>

        <Field label="Discipline preset">
          <div className="flex flex-wrap gap-2">
            {[...disciplinePresets, customPreset].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`px-3 py-1.5 rounded-full border text-sm ${
                  presetId === p.id
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    : 'border-subtle'
                }`}
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
              className="w-full rounded-md border border-subtle bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full rounded-md border border-subtle bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full rounded-md border border-subtle bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Field>

        <Field label="Standing lanes (optional)">
          <input
            value={standing}
            onChange={(e) => setStanding(e.target.value)}
            className="w-full rounded-md border border-subtle bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. 1, 4, 5"
            inputMode="text"
          />
        </Field>

        <Field label="Kneeling lanes (optional)">
          <input
            value={kneeling}
            onChange={(e) => setKneeling(e.target.value)}
            className="w-full rounded-md border border-subtle bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. 7, 12"
            inputMode="text"
          />
        </Field>

        <Field label="Categories">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.id)}
                className={`px-3 py-1 rounded-full border text-sm ${
                  selectedCategoryIds.includes(c.id)
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    : 'border-subtle'
                }`}
              >
                {c.label}
              </button>
            ))}
            {categories.length === 0 && <p className="text-xs text-muted">No categories available.</p>}
          </div>
        </Field>

        <Field label="Visibility">
          <div className="flex gap-2">
            {(['public', 'club_only', 'unlisted'] as EventVisibility[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={`px-3 py-1.5 rounded-md border text-sm flex-1 ${
                  visibility === v
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    : 'border-subtle'
                }`}
              >
                {v === 'public' ? 'Public' : v === 'club_only' ? 'Club only' : 'Unlisted'}
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-white text-sm disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wider text-secondary mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
