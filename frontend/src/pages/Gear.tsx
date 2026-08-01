import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, X } from 'lucide-react'
import { gearApi, Rifle, Pellet, CreateRiflePayload, CreatePelletPayload } from '../api/gear'
import { statsApi, RifleStats } from '../api/stats'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CatalogSearch } from '../components/CatalogSearch'
import { RifleProfileCard } from '../components/RifleProfileCard'
import { PelletProfileCard } from '../components/PelletProfileCard'
import { RIFLE_CATALOG, RifleCatalogEntry } from '../catalog/rifleCatalog'
import { PELLET_CATALOG, PelletCatalogEntry } from '../catalog/pelletCatalog'
import { rifleImage, pelletImage, UNKNOWN_BRAND_IMAGE } from '../catalog/brandImages'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

// ─── Shared ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs tracking-wide text-muted mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2 text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50'

const selectCls =
  'w-full bg-surface border border-subtle rounded px-2 py-1.5 text-primary text-xs tracking-wide focus:outline-none focus:border-[var(--brass)]/50'

// ─── Rifle section ────────────────────────────────────────────────────────────

function AddRifleForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CreateRiflePayload>({ make: '', model: '', calibre: '.177' })
  const [showFields, setShowFields] = useState(false)
  const [makeFilter, setMakeFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [calibreFilter, setCalibreFilter] = useState('')

  const makes = useMemo(() => [...new Set(RIFLE_CATALOG.map(e => e.make))].sort(), [])

  const models = useMemo(() => {
    let items: RifleCatalogEntry[] = RIFLE_CATALOG
    if (makeFilter) items = items.filter(e => e.make === makeFilter)
    if (calibreFilter) items = items.filter(e => e.calibre === calibreFilter)
    return [...new Set(items.map(e => e.model))].sort()
  }, [makeFilter, calibreFilter])

  const calibres = useMemo(() => {
    let items: RifleCatalogEntry[] = RIFLE_CATALOG
    if (makeFilter) items = items.filter(e => e.make === makeFilter)
    return [...new Set(items.map(e => e.calibre))].sort()
  }, [makeFilter])

  const filteredCatalog = useMemo(() => {
    let items: RifleCatalogEntry[] = RIFLE_CATALOG
    if (makeFilter) items = items.filter(e => e.make === makeFilter)
    if (modelFilter) items = items.filter(e => e.model === modelFilter)
    if (calibreFilter) items = items.filter(e => e.calibre === calibreFilter)
    return items
  }, [makeFilter, modelFilter, calibreFilter])

  const mutation = useMutation({
    mutationFn: () => gearApi.createRifle(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rifles'] })
      toast('Rifle added', 'success')
      onDone()
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to add rifle', 'error'),
  })

  function handleCatalogSelect(entry: RifleCatalogEntry) {
    setForm({
      make: entry.make,
      model: entry.model,
      calibre: entry.calibre,
      power_ftlb: entry.power_ftlb,
      image_url: entry.image_url,
    })
    setShowFields(true)
  }

  return (
    <div className="space-y-3 p-3 lg:p-4 rounded border border-subtle bg-surface">
      {!showFields && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <select className={selectCls} value={makeFilter} onChange={e => { setMakeFilter(e.target.value); setModelFilter('') }}>
              <option value="">All brands</option>
              {makes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className={selectCls} value={modelFilter} onChange={e => setModelFilter(e.target.value)}>
              <option value="">All models</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className={selectCls} value={calibreFilter} onChange={e => setCalibreFilter(e.target.value)}>
              <option value="">All calibres</option>
              {calibres.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <CatalogSearch
            items={filteredCatalog}
            searchKeys={['make', 'model']}
            renderItem={(e) => `${e.make} ${e.model}`}
            renderDetail={(e) => [e.calibre, e.power_ftlb != null ? `${e.power_ftlb} ft·lb` : ''].filter(Boolean).join(' · ')}
            renderImage={rifleImage}
            fallbackImage={UNKNOWN_BRAND_IMAGE}
            onSelect={handleCatalogSelect}
            onManualEntry={() => setShowFields(true)}
            placeholder="Search rifles — e.g. HW100, Air Arms..."
          />
          <button
            type="button"
            onClick={() => setShowFields(true)}
            className="t-section-title hover:text-secondary transition-colors"
          >
            or enter manually →
          </button>
        </>
      )}
      {showFields && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Make">
              <input className={inputCls} placeholder="Weihrauch" value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} />
            </Field>
            <Field label="Model">
              <input className={inputCls} placeholder="HW100" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calibre">
              <input className={inputCls} placeholder=".177" value={form.calibre ?? ''} onChange={e => setForm(f => ({ ...f, calibre: e.target.value }))} />
            </Field>
            <Field label="Power (ft·lb)">
              <input className={inputCls} type="number" step="0.01" placeholder="11.5" value={form.power_ftlb ?? ''} onChange={e => setForm(f => ({ ...f, power_ftlb: e.target.value ? Number(e.target.value) : undefined }))} />
            </Field>
          </div>
          {mutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to save rifle. Please try again.</p>}
          <div className="flex gap-2">
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.make || !form.model} className="flex-1 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed">
              {mutation.isPending ? 'Saving…' : 'Add Rifle'}
            </button>
            <button onClick={onDone} className="px-4 py-2 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors">Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}

function RifleRow({ rifle, stats }: { rifle: Rifle; stats?: RifleStats }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState({ make: rifle.make, model: rifle.model, calibre: rifle.calibre ?? '', power_ftlb: rifle.power_ftlb })

  const del = useMutation({
    mutationFn: () => gearApi.deleteRifle(rifle.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rifles'] }); toast('Rifle deleted', 'success') },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to delete rifle', 'error'),
  })
  const imgMutation = useMutation({
    mutationFn: (file: File) => gearApi.uploadRifleImage(rifle.id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rifles'] }),
    onError: () => toast('Failed to upload image', 'error'),
  })
  const updateMutation = useMutation({
    mutationFn: () => gearApi.updateRifle(rifle.id, {
      make: form.make,
      model: form.model,
      calibre: form.calibre || undefined,
      power_ftlb: form.power_ftlb,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rifles'] })
      toast('Rifle updated', 'success')
      setEditing(false)
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to update rifle', 'error'),
  })

  if (editing) {
    return (
      <div className="space-y-3 p-3 lg:p-4 rounded border border-subtle bg-surface">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make">
            <input className={inputCls} value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} />
          </Field>
          <Field label="Model">
            <input className={inputCls} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calibre">
            <input className={inputCls} value={form.calibre} onChange={e => setForm(f => ({ ...f, calibre: e.target.value }))} />
          </Field>
          <Field label="Power (ft·lb)">
            <input className={inputCls} type="number" step="0.01" value={form.power_ftlb ?? ''} onChange={e => setForm(f => ({ ...f, power_ftlb: e.target.value ? Number(e.target.value) : undefined }))} />
          </Field>
        </div>
        {updateMutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to save. Please try again.</p>}
        <div className="flex gap-2">
          <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !form.make || !form.model} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Check size={13} /> {updateMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} disabled={updateMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle t-section-title hover:text-secondary transition-colors">
            <X size={13} /> Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <RifleProfileCard
        rifle={rifle}
        stats={stats}
        mode="gear"
        onUploadImage={file => imgMutation.mutate(file)}
        isUploadPending={imgMutation.isPending}
        onEdit={() => { setForm({ make: rifle.make, model: rifle.model, calibre: rifle.calibre ?? '', power_ftlb: rifle.power_ftlb }); setEditing(true) }}
        onDelete={() => setConfirmDelete(true)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${rifle.make} ${rifle.model}?`}
        message="This rifle will be removed from your gear list. Score cards linked to it will keep their data."
        onConfirm={() => { setConfirmDelete(false); del.mutate() }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}

function RiflesTab() {
  const [adding, setAdding] = useState(false)
  const { data, isLoading, isError } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: rifleStatsData } = useQuery({ queryKey: ['rifle-stats'], queryFn: () => statsApi.getRifleStats() })
  const rifles = data?.items ?? []
  const rifleStatsMap = useMemo(() => {
    const map = new Map<string, RifleStats>()
    for (const rs of rifleStatsData?.items ?? []) map.set(rs.rifle_id, rs)
    return map
  }, [rifleStatsData])

  return (
    <div className="space-y-4">
      {!adding && (
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity">
          <Plus size={13} /> Add Rifle
        </button>
      )}
      {adding && <AddRifleForm onDone={() => setAdding(false)} />}
      {isLoading && <div className="h-12 rounded skeleton" />}
      {isError && <p className="text-[var(--error-text)] text-sm">Failed to load rifles. Please try again.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rifles.map(r => <RifleRow key={r.id} rifle={r} stats={rifleStatsMap.get(r.id)} />)}
      </div>
      {!isLoading && !isError && rifles.length === 0 && !adding && (
        <p className="text-muted text-sm">No rifles added yet.</p>
      )}
    </div>
  )
}

// ─── Pellet section ───────────────────────────────────────────────────────────

function AddPelletForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CreatePelletPayload>({ brand: '', model: '' })
  const [showFields, setShowFields] = useState(false)
  const [brandFilter, setBrandFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [calibreFilter, setCalibreFilter] = useState('')
  const [sizeFilter, setSizeFilter] = useState('')

  const pelletCalibre = (mm?: number) => mm != null ? (mm < 5 ? '.177' : '.22') : undefined

  const brands = useMemo(() => [...new Set(PELLET_CATALOG.map(e => e.brand))].sort(), [])

  const models = useMemo(() => {
    let items: PelletCatalogEntry[] = PELLET_CATALOG
    if (brandFilter) items = items.filter(e => e.brand === brandFilter)
    if (calibreFilter) items = items.filter(e => pelletCalibre(e.head_size_mm) === calibreFilter)
    return [...new Set(items.map(e => e.model))].sort()
  }, [brandFilter, calibreFilter])

  const calibres = useMemo(() => {
    let items: PelletCatalogEntry[] = PELLET_CATALOG
    if (brandFilter) items = items.filter(e => e.brand === brandFilter)
    const cals = new Set(items.map(e => pelletCalibre(e.head_size_mm)).filter(Boolean))
    return [...cals].sort() as string[]
  }, [brandFilter])

  const sizes = useMemo(() => {
    let items: PelletCatalogEntry[] = PELLET_CATALOG
    if (brandFilter) items = items.filter(e => e.brand === brandFilter)
    if (modelFilter) items = items.filter(e => e.model === modelFilter)
    if (calibreFilter) items = items.filter(e => pelletCalibre(e.head_size_mm) === calibreFilter)
    return [...new Set(items.filter(e => e.head_size_mm != null).map(e => e.head_size_mm!))].sort((a, b) => a - b)
  }, [brandFilter, modelFilter, calibreFilter])

  const filteredCatalog = useMemo(() => {
    let items: PelletCatalogEntry[] = PELLET_CATALOG
    if (brandFilter) items = items.filter(e => e.brand === brandFilter)
    if (modelFilter) items = items.filter(e => e.model === modelFilter)
    if (calibreFilter) items = items.filter(e => pelletCalibre(e.head_size_mm) === calibreFilter)
    if (sizeFilter) items = items.filter(e => e.head_size_mm === Number(sizeFilter))
    return items
  }, [brandFilter, modelFilter, calibreFilter, sizeFilter])

  const mutation = useMutation({
    mutationFn: () => gearApi.createPellet(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellets'] })
      toast('Pellet added', 'success')
      onDone()
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to add pellet', 'error'),
  })

  function handleCatalogSelect(entry: PelletCatalogEntry) {
    setForm({
      brand: entry.brand,
      model: entry.model,
      head_size_mm: entry.head_size_mm,
      weight_grains: entry.weight_grains,
      image_url: entry.image_url,
    })
    setShowFields(true)
  }

  return (
    <div className="space-y-3 p-3 lg:p-4 rounded border border-subtle bg-surface">
      {!showFields && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select className={selectCls} value={brandFilter} onChange={e => { setBrandFilter(e.target.value); setModelFilter(''); setSizeFilter('') }}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select className={selectCls} value={modelFilter} onChange={e => { setModelFilter(e.target.value); setSizeFilter('') }}>
              <option value="">All models</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className={selectCls} value={calibreFilter} onChange={e => { setCalibreFilter(e.target.value); setSizeFilter('') }}>
              <option value="">All calibres</option>
              {calibres.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={selectCls} value={sizeFilter} onChange={e => setSizeFilter(e.target.value)}>
              <option value="">All sizes</option>
              {sizes.map(s => <option key={s} value={String(s)}>{s.toFixed(2)}mm</option>)}
            </select>
          </div>
          <CatalogSearch
            items={filteredCatalog}
            searchKeys={['brand', 'model']}
            renderItem={(e) => `${e.brand} ${e.model}`}
            renderDetail={(e) => [e.head_size_mm != null ? `${e.head_size_mm}mm` : '', e.weight_grains != null ? `${e.weight_grains}gr` : ''].filter(Boolean).join(' · ')}
            renderImage={pelletImage}
            fallbackImage={UNKNOWN_BRAND_IMAGE}
            onSelect={handleCatalogSelect}
            onManualEntry={() => setShowFields(true)}
            placeholder="Search pellets — e.g. JSB Exact, H&N..."
          />
          <button
            type="button"
            onClick={() => setShowFields(true)}
            className="t-section-title hover:text-secondary transition-colors"
          >
            or enter manually →
          </button>
        </>
      )}
      {showFields && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand">
              <input className={inputCls} placeholder="JSB" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
            </Field>
            <Field label="Model">
              <input className={inputCls} placeholder="Match Exact" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Head size (mm)">
              <input className={inputCls} type="number" step="0.01" placeholder="4.51" value={form.head_size_mm ?? ''} onChange={e => setForm(f => ({ ...f, head_size_mm: e.target.value ? Number(e.target.value) : undefined }))} />
            </Field>
            <Field label="Weight (grains)">
              <input className={inputCls} type="number" step="0.01" placeholder="8.44" value={form.weight_grains ?? ''} onChange={e => setForm(f => ({ ...f, weight_grains: e.target.value ? Number(e.target.value) : undefined }))} />
            </Field>
          </div>
          <Field label="Batch code">
            <input className={inputCls} placeholder="Optional" onChange={e => setForm(f => ({ ...f, batch_code: e.target.value || undefined }))} />
          </Field>
          {mutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to save pellet. Please try again.</p>}
          <div className="flex gap-2">
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.brand || !form.model} className="flex-1 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed">
              {mutation.isPending ? 'Saving…' : 'Add Pellet'}
            </button>
            <button onClick={onDone} className="px-4 py-2 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors">Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}

function PelletRow({ pellet }: { pellet: Pellet }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState({ brand: pellet.brand, model: pellet.model, head_size_mm: pellet.head_size_mm, weight_grains: pellet.weight_grains, batch_code: pellet.batch_code ?? '' })

  const del = useMutation({
    mutationFn: () => gearApi.deletePellet(pellet.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pellets'] }); toast('Pellet deleted', 'success') },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to delete pellet', 'error'),
  })
  const imgMutation = useMutation({
    mutationFn: (file: File) => gearApi.uploadPelletImage(pellet.id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pellets'] }),
    onError: () => toast('Failed to upload image', 'error'),
  })
  const updateMutation = useMutation({
    mutationFn: () => gearApi.updatePellet(pellet.id, {
      brand: form.brand,
      model: form.model,
      head_size_mm: form.head_size_mm,
      weight_grains: form.weight_grains,
      batch_code: form.batch_code || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellets'] })
      toast('Pellet updated', 'success')
      setEditing(false)
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to update pellet', 'error'),
  })

  if (editing) {
    return (
      <div className="space-y-3 p-3 lg:p-4 rounded border border-subtle bg-surface">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand">
            <input className={inputCls} value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
          </Field>
          <Field label="Model">
            <input className={inputCls} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Head size (mm)">
            <input className={inputCls} type="number" step="0.01" value={form.head_size_mm ?? ''} onChange={e => setForm(f => ({ ...f, head_size_mm: e.target.value ? Number(e.target.value) : undefined }))} />
          </Field>
          <Field label="Weight (grains)">
            <input className={inputCls} type="number" step="0.01" value={form.weight_grains ?? ''} onChange={e => setForm(f => ({ ...f, weight_grains: e.target.value ? Number(e.target.value) : undefined }))} />
          </Field>
        </div>
        <Field label="Batch code">
          <input className={inputCls} value={form.batch_code} onChange={e => setForm(f => ({ ...f, batch_code: e.target.value }))} />
        </Field>
        {updateMutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to save. Please try again.</p>}
        <div className="flex gap-2">
          <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !form.brand || !form.model} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Check size={13} /> {updateMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} disabled={updateMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle t-section-title hover:text-secondary transition-colors">
            <X size={13} /> Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <PelletProfileCard
        pellet={pellet}
        onUploadImage={file => imgMutation.mutate(file)}
        isUploadPending={imgMutation.isPending}
        onEdit={() => { setForm({ brand: pellet.brand, model: pellet.model, head_size_mm: pellet.head_size_mm, weight_grains: pellet.weight_grains, batch_code: pellet.batch_code ?? '' }); setEditing(true) }}
        onDelete={() => setConfirmDelete(true)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${pellet.brand} ${pellet.model}?`}
        message="This pellet will be removed from your gear list. Score cards and test data linked to it will keep their data."
        onConfirm={() => { setConfirmDelete(false); del.mutate() }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}

function PelletsTab() {
  const [adding, setAdding] = useState(false)
  const { data, isLoading, isError } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const pellets = data?.items ?? []

  return (
    <div className="space-y-4">
      {!adding && (
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity">
          <Plus size={13} /> Add Pellet
        </button>
      )}
      {adding && <AddPelletForm onDone={() => setAdding(false)} />}
      {isLoading && <div className="h-12 rounded skeleton" />}
      {isError && <p className="text-[var(--error-text)] text-sm">Failed to load pellets. Please try again.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pellets.map(p => <PelletRow key={p.id} pellet={p} />)}
      </div>
      {!isLoading && !isError && pellets.length === 0 && !adding && (
        <p className="text-muted text-sm">No pellets added yet.</p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'rifles' | 'pellets'

export default function Gear() {
  const [tab, setTab] = useState<Tab>('rifles')

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-12 lg:pt-7 lg:pb-20 space-y-5 lg:space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="t-page-title">Gear</h1>
        <HelpIcon content={pageHelp.gear} />
      </div>

      <div className="flex gap-1 border-b border-subtle">
        {(['rifles', 'pellets'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-4 py-2 text-[11px] tracking-widest uppercase transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-[var(--brass)] text-[var(--brass)]'
                : 'border-transparent text-muted hover:text-secondary',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'rifles' ? <RiflesTab /> : <PelletsTab />}
    </div>
  )
}
