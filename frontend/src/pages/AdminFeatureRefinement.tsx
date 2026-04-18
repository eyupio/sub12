import { FormEvent, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { featureRequestsApi, FeatureRequestStatus } from '../api/featureRequests'

const statuses: FeatureRequestStatus[] = ['submitted', 'refining', 'accepted', 'rejected', 'planned', 'in_progress', 'done']

export default function AdminFeatureRefinement() {
  const [ticketID, setTicketID] = useState('')
  const [featureRequestID, setFeatureRequestID] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<FeatureRequestStatus>('refining')

  const createMutation = useMutation({
    mutationFn: () => featureRequestsApi.adminCreateFromTicket(ticketID, {
      title,
      refined_description: description,
    }),
  })

  const updateMutation = useMutation({
    mutationFn: () => featureRequestsApi.adminUpdate(featureRequestID, {
      title,
      refined_description: description,
      status,
    }),
  })

  function onCreate(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate()
  }

  function onUpdate(e: FormEvent) {
    e.preventDefault()
    updateMutation.mutate()
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Admin feature refinement</h1>
      <p className="text-sm text-muted">Accept tickets as feature requests, then refine scope and roadmap status.</p>

      <form onSubmit={onCreate} className="rounded-xl border border-subtle bg-surface p-4 space-y-3">
        <h2 className="font-medium">Accept ticket as feature request</h2>
        <input className="w-full rounded-md border border-subtle bg-transparent p-2" value={ticketID} onChange={e => setTicketID(e.target.value)} placeholder="Ticket ID" />
        <input className="w-full rounded-md border border-subtle bg-transparent p-2" value={title} onChange={e => setTitle(e.target.value)} placeholder="Feature title" />
        <textarea className="w-full rounded-md border border-subtle bg-transparent p-2" value={description} onChange={e => setDescription(e.target.value)} placeholder="Refined description" rows={4} />
        <button className="rounded-md bg-[var(--brass)] px-3 py-2 text-sm text-black font-medium" disabled={createMutation.isPending}>Create feature request</button>
      </form>

      <form onSubmit={onUpdate} className="rounded-xl border border-subtle bg-surface p-4 space-y-3">
        <h2 className="font-medium">Edit existing feature request</h2>
        <input className="w-full rounded-md border border-subtle bg-transparent p-2" value={featureRequestID} onChange={e => setFeatureRequestID(e.target.value)} placeholder="Feature request ID" />
        <input className="w-full rounded-md border border-subtle bg-transparent p-2" value={title} onChange={e => setTitle(e.target.value)} placeholder="Feature title" />
        <textarea className="w-full rounded-md border border-subtle bg-transparent p-2" value={description} onChange={e => setDescription(e.target.value)} placeholder="Refined description" rows={4} />
        <select className="w-full rounded-md border border-subtle bg-transparent p-2" value={status} onChange={e => setStatus(e.target.value as FeatureRequestStatus)}>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="rounded-md bg-[var(--brass)] px-3 py-2 text-sm text-black font-medium" disabled={updateMutation.isPending}>Update feature request</button>
      </form>
    </div>
  )
}
