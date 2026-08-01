import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import {
  eventInvitationsApi,
  type PotentialInviteeDTO,
  type PotentialInviteeSource,
} from '../../api/eventInvitations'
import { toast } from '../../store/toast'
import { identiconDataUri } from '../../utils/identicon'
import { WIZARD_INPUT_CLS, WIZARD_LABEL_CLS, toggleCls } from './wizardShared'
import { Skeleton } from '../Skeleton'

interface Props {
  slug: string
  hasClub: boolean
}

type Tab = PotentialInviteeSource

export function InviteStep({ slug, hasClub }: Props) {
  const qc = useQueryClient()
  const initialTab: Tab = hasClub ? 'club' : 'followers'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [searchQ, setSearchQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selected, setSelected] = useState<Map<string, PotentialInviteeDTO>>(new Map())

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300)
    return () => clearTimeout(t)
  }, [searchQ])

  const inviteesQuery = useQuery({
    queryKey: ['event-invitees', slug, tab, tab === 'search' ? debouncedQ : ''],
    queryFn: () =>
      eventInvitationsApi.listPotentialInvitees(slug, {
        source: tab,
        q: tab === 'search' ? debouncedQ : undefined,
      }),
    enabled: tab !== 'search' || debouncedQ.length > 0,
  })

  const invitationsQuery = useQuery({
    queryKey: ['event-invitations', slug],
    queryFn: () => eventInvitationsApi.list(slug),
  })
  const invitedIds = useMemo(() => {
    const set = new Set<string>()
    for (const it of invitationsQuery.data?.items ?? []) set.add(it.invitee_user_id)
    return set
  }, [invitationsQuery.data])

  const items = inviteesQuery.data?.items ?? []

  const sendMutation = useMutation({
    mutationFn: () => eventInvitationsApi.createBatch(slug, Array.from(selected.keys())),
    onSuccess: (data) => {
      const sent = data.results.filter((r) => r.status === 'invited').length
      toast(`Sent ${sent} invitation${sent === 1 ? '' : 's'}`, 'success')
      setSelected(new Map())
      qc.invalidateQueries({ queryKey: ['event-invitations', slug] })
      qc.invalidateQueries({ queryKey: ['event-invitees', slug] })
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to send invitations', 'error'),
  })

  function togglePick(u: PotentialInviteeDTO) {
    if (u.is_already_participant || invitedIds.has(u.user_id) || u.is_already_invited) return
    setSelected((cur) => {
      const next = new Map(cur)
      if (next.has(u.user_id)) next.delete(u.user_id)
      else next.set(u.user_id, u)
      return next
    })
  }

  const tabs: { key: Tab; label: string; visible: boolean }[] = [
    { key: 'club', label: 'Club members', visible: hasClub },
    { key: 'followers', label: 'Followers', visible: !hasClub },
    { key: 'following', label: 'Following', visible: !hasClub },
    { key: 'search', label: 'Search', visible: !hasClub },
  ]

  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-5">
      <header>
        <h2 className="t-subsection-title">Invite shooters</h2>
        <p className="text-sm text-muted">
          {hasClub
            ? 'Pick club members to invite. They’ll get an email with a join link.'
            : 'Invite people you follow, your followers, or search for users with public profiles.'}
        </p>
      </header>

      {!hasClub && (
        <div className="flex flex-wrap gap-2">
          {tabs.filter((t) => t.visible).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={toggleCls(tab === t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'search' && (
        <label className="block">
          <span className={WIZARD_LABEL_CLS}>Search by name</span>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className={`${WIZARD_INPUT_CLS} pl-9`}
              placeholder="Type a display name…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
        </label>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from(selected.values()).map((u) => (
            <span
              key={u.user_id}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-gold-tint/40 border border-gold/30 text-[12px] text-ink"
            >
              {u.display_name}
              <button
                type="button"
                aria-label={`Remove ${u.display_name}`}
                onClick={() => togglePick(u)}
                className="rounded-full hover:bg-gold/10 p-0.5"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="border border-line rounded-lg divide-y divide-line max-h-96 overflow-y-auto">
        {inviteesQuery.isLoading && (
          <div className="p-4 space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} height={32} />)}</div>
        )}
        {!inviteesQuery.isLoading && items.length === 0 && (
          <div className="p-4 text-sm text-muted">
            {tab === 'search' && debouncedQ.length === 0
              ? 'Type a name to search.'
              : 'No users to show.'}
          </div>
        )}
        {items.map((u) => {
          const alreadyInvited = u.is_already_invited || invitedIds.has(u.user_id)
          const disabled = u.is_already_participant || alreadyInvited
          const picked = selected.has(u.user_id)
          return (
            <button
              key={u.user_id}
              type="button"
              disabled={disabled}
              onClick={() => togglePick(u)}
              className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                picked ? 'bg-gold-tint/30' : 'hover:bg-bg'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Avatar url={u.avatar_url} name={u.display_name} />
              <span className="flex-1 text-sm text-primary truncate">{u.display_name}</span>
              {u.is_already_participant && (
                <span className="text-[10px] tracking-widest uppercase text-muted">Joined</span>
              )}
              {!u.is_already_participant && alreadyInvited && (
                <span className="text-[10px] tracking-widest uppercase text-muted">Invited</span>
              )}
              {!disabled && picked && (
                <span className="text-[10px] tracking-widest uppercase text-gold">Selected</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          disabled={selected.size === 0 || sendMutation.isPending}
          onClick={() => sendMutation.mutate()}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gold text-inverse text-xs uppercase tracking-widest font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sendMutation.isPending
            ? 'Sending…'
            : selected.size === 0
              ? 'Pick someone to invite'
              : `Send ${selected.size} invitation${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </section>
  )
}

function Avatar({ url, name }: { url?: string; name: string }) {
  return <img src={url || identiconDataUri(name)} alt="" className="w-8 h-8 rounded-full object-cover" />
}
