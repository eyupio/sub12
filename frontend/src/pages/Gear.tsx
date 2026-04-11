import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { gearApi, Rifle, Pellet, CreateRiflePayload, CreatePelletPayload } from '../api/gear'

// ─── Shared ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2 text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50'

// ─── Rifle section ────────────────────────────────────────────────────────────

function AddRifleForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CreateRiflePayload>({ make: '', model: '', calibre: '.177' })

  const mutation = useMutation({
    mutationFn: () => gearApi.createRifle(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rifles'] })
      onDone()
    },
  })

  return (
    <div className="space-y-3 p-3 lg:p-4 rounded border border-subtle bg-surface">
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
          <input className={inputCls} type="number" step="0.01" placeholder="11.5" onChange={e => setForm(f => ({ ...f, power_ftlb: e.target.value ? Number(e.target.value) : undefined }))} />
        </Field>
      </div>
      {mutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to save rifle. Please try again.</p>}
      <div className="flex gap-2">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.make || !form.model} className="flex-1 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-40">
          {mutation.isPending ? 'Saving…' : 'Add Rifle'}
        </button>
        <button onClick={onDone} className="px-4 py-2 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors">Cancel</button>
      </div>
    </div>
  )
}

function RifleRow({ rifle }: { rifle: Rifle }) {
  const qc = useQueryClient()
  const del = useMutation({
    mutationFn: () => gearApi.deleteRifle(rifle.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rifles'] }),
  })

  return (
    <div className="flex items-center justify-between p-3 lg:p-4 rounded border border-subtle bg-surface">
      <div>
        <p className="text-secondary text-sm font-medium">{rifle.make} {rifle.model}</p>
        <p className="text-[11px] text-muted tracking-wide">{rifle.calibre}{rifle.power_ftlb != null ? ` · ${rifle.power_ftlb} ft·lb` : ''}</p>
      </div>
      <button
        onClick={() => { if (window.confirm(`Delete ${rifle.make} ${rifle.model}?`)) del.mutate() }}
        disabled={del.isPending}
        className="text-muted hover:text-[var(--error-text)] transition-colors"
        aria-label="Delete rifle"
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function RiflesTab() {
  const [adding, setAdding] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const rifles = data?.items ?? []

  return (
    <div className="space-y-3">
      {!adding && (
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity">
          <Plus size={13} /> Add Rifle
        </button>
      )}
      {adding && <AddRifleForm onDone={() => setAdding(false)} />}
      {isLoading && <div className="h-12 rounded bg-surface animate-pulse" />}
      {rifles.map(r => <RifleRow key={r.id} rifle={r} />)}
      {!isLoading && rifles.length === 0 && !adding && (
        <p className="text-muted text-sm">No rifles added yet.</p>
      )}
    </div>
  )
}

// ─── Pellet section ───────────────────────────────────────────────────────────

function AddPelletForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CreatePelletPayload>({ brand: '', model: '' })

  const mutation = useMutation({
    mutationFn: () => gearApi.createPellet(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pellets'] })
      onDone()
    },
  })

  return (
    <div className="space-y-3 p-3 lg:p-4 rounded border border-subtle bg-surface">
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
          <input className={inputCls} type="number" step="0.01" placeholder="4.51" onChange={e => setForm(f => ({ ...f, head_size_mm: e.target.value ? Number(e.target.value) : undefined }))} />
        </Field>
        <Field label="Weight (grains)">
          <input className={inputCls} type="number" step="0.01" placeholder="8.44" onChange={e => setForm(f => ({ ...f, weight_grains: e.target.value ? Number(e.target.value) : undefined }))} />
        </Field>
      </div>
      <Field label="Batch code">
        <input className={inputCls} placeholder="Optional" onChange={e => setForm(f => ({ ...f, batch_code: e.target.value || undefined }))} />
      </Field>
      {mutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to save pellet. Please try again.</p>}
      <div className="flex gap-2">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.brand || !form.model} className="flex-1 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-40">
          {mutation.isPending ? 'Saving…' : 'Add Pellet'}
        </button>
        <button onClick={onDone} className="px-4 py-2 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors">Cancel</button>
      </div>
    </div>
  )
}

function PelletRow({ pellet }: { pellet: Pellet }) {
  const qc = useQueryClient()
  const del = useMutation({
    mutationFn: () => gearApi.deletePellet(pellet.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pellets'] }),
  })

  return (
    <div className="flex items-center justify-between p-3 lg:p-4 rounded border border-subtle bg-surface">
      <div>
        <p className="text-secondary text-sm font-medium">{pellet.brand} {pellet.model}</p>
        <p className="text-[11px] text-muted tracking-wide">
          {[
            pellet.head_size_mm != null && `${pellet.head_size_mm}mm`,
            pellet.weight_grains != null && `${pellet.weight_grains}gr`,
            pellet.batch_code,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
      <button
        onClick={() => { if (window.confirm(`Delete ${pellet.brand} ${pellet.model}?`)) del.mutate() }}
        disabled={del.isPending}
        className="text-muted hover:text-[var(--error-text)] transition-colors"
        aria-label="Delete pellet"
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function PelletsTab() {
  const [adding, setAdding] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const pellets = data?.items ?? []

  return (
    <div className="space-y-3">
      {!adding && (
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity">
          <Plus size={13} /> Add Pellet
        </button>
      )}
      {adding && <AddPelletForm onDone={() => setAdding(false)} />}
      {isLoading && <div className="h-12 rounded bg-surface animate-pulse" />}
      {pellets.map(p => <PelletRow key={p.id} pellet={p} />)}
      {!isLoading && pellets.length === 0 && !adding && (
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
    <div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Gear</h1>

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
