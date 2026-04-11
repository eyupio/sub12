import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { gearApi, Rifle, Pellet, CreateRiflePayload, CreatePelletPayload } from '../api/gear'

// ─── Shared ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] tracking-widest uppercase text-white/40 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#D4A44A]/50'

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
    <div className="space-y-3 p-3 rounded border border-white/[0.08] bg-white/[0.02]">
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
      {mutation.isError && <p className="text-red-400 text-xs">{String(mutation.error)}</p>}
      <div className="flex gap-2">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.make || !form.model} className="flex-1 py-2 rounded bg-[#D4A44A] text-black text-sm font-medium tracking-widest uppercase disabled:opacity-40">
          {mutation.isPending ? 'Saving…' : 'Add Rifle'}
        </button>
        <button onClick={onDone} className="px-4 py-2 rounded border border-white/[0.08] text-white/40 text-sm hover:text-white/60 transition-colors">Cancel</button>
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
    <div className="flex items-center justify-between p-3 rounded border border-white/[0.06] bg-white/[0.02]">
      <div>
        <p className="text-white/80 text-sm font-medium">{rifle.make} {rifle.model}</p>
        <p className="text-[11px] text-white/30 tracking-wide">{rifle.calibre}{rifle.power_ftlb != null ? ` · ${rifle.power_ftlb} ft·lb` : ''}</p>
      </div>
      <button onClick={() => del.mutate()} disabled={del.isPending} className="text-white/20 hover:text-red-400 transition-colors" aria-label="Delete rifle">
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
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-[11px] tracking-widest uppercase text-[#D4A44A] hover:text-[#e0b45a] transition-colors">
          <Plus size={13} /> Add Rifle
        </button>
      )}
      {adding && <AddRifleForm onDone={() => setAdding(false)} />}
      {isLoading && <div className="h-12 rounded bg-white/[0.02] animate-pulse" />}
      {rifles.map(r => <RifleRow key={r.id} rifle={r} />)}
      {!isLoading && rifles.length === 0 && !adding && (
        <p className="text-white/20 text-sm">No rifles added yet.</p>
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
    <div className="space-y-3 p-3 rounded border border-white/[0.08] bg-white/[0.02]">
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
      {mutation.isError && <p className="text-red-400 text-xs">{String(mutation.error)}</p>}
      <div className="flex gap-2">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.brand || !form.model} className="flex-1 py-2 rounded bg-[#D4A44A] text-black text-sm font-medium tracking-widest uppercase disabled:opacity-40">
          {mutation.isPending ? 'Saving…' : 'Add Pellet'}
        </button>
        <button onClick={onDone} className="px-4 py-2 rounded border border-white/[0.08] text-white/40 text-sm hover:text-white/60 transition-colors">Cancel</button>
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
    <div className="flex items-center justify-between p-3 rounded border border-white/[0.06] bg-white/[0.02]">
      <div>
        <p className="text-white/80 text-sm font-medium">{pellet.brand} {pellet.model}</p>
        <p className="text-[11px] text-white/30 tracking-wide">
          {[
            pellet.head_size_mm != null && `${pellet.head_size_mm}mm`,
            pellet.weight_grains != null && `${pellet.weight_grains}gr`,
            pellet.batch_code,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
      <button onClick={() => del.mutate()} disabled={del.isPending} className="text-white/20 hover:text-red-400 transition-colors" aria-label="Delete pellet">
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
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-[11px] tracking-widest uppercase text-[#D4A44A] hover:text-[#e0b45a] transition-colors">
          <Plus size={13} /> Add Pellet
        </button>
      )}
      {adding && <AddPelletForm onDone={() => setAdding(false)} />}
      {isLoading && <div className="h-12 rounded bg-white/[0.02] animate-pulse" />}
      {pellets.map(p => <PelletRow key={p.id} pellet={p} />)}
      {!isLoading && pellets.length === 0 && !adding && (
        <p className="text-white/20 text-sm">No pellets added yet.</p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'rifles' | 'pellets'

export default function Gear() {
  const [tab, setTab] = useState<Tab>('rifles')

  return (
    <div className="p-4 space-y-5 max-w-lg mx-auto">
      <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">Gear</h1>

      <div className="flex gap-1 border-b border-white/[0.06]">
        {(['rifles', 'pellets'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-4 py-2 text-[11px] tracking-widest uppercase transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-[#D4A44A] text-[#D4A44A]'
                : 'border-transparent text-white/30 hover:text-white/60',
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
