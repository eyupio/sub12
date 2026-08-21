import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computeInsights } from '../dashboardInsights'
import type { MyLeagueSummary } from '../../api/leagues'

const basePayload = {
  stats: undefined,
  recentCards: [],
  rifles: [],
  rifleStats: [],
  enrichedRifleStats: [],
  pelletTestStats: undefined,
}

describe('computeInsights — league-ending countdown', () => {
  let originalTZ: string | undefined

  beforeEach(() => {
    originalTZ = process.env.TZ
    // A fixed UTC-12 zone (no DST) — anyone west of UTC is exposed to the bug,
    // this is just a stable representative.
    process.env.TZ = 'Etc/GMT+12'
    vi.useFakeTimers()
    // Local time in Etc/GMT+12 is Apr 11 23:00 — one hour before local
    // midnight rolls the calendar to Apr 12.
    vi.setSystemTime(new Date('2026-04-12T11:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTZ
  })

  it('treats ends_on as a local calendar date, not UTC midnight', () => {
    // Local "today" is Apr 11 (23:00), and this league's season ends 8 local
    // calendar days later, on Apr 19 — outside the 7-day "closing soon"
    // window, so no insight should fire.
    //
    // Parsing "2026-04-19" as UTC midnight instead (the bug) lands it 12
    // hours earlier in this zone, pulling the countdown from 8 days down to
    // 7 and incorrectly flagging the league as closing soon.
    const league: MyLeagueSummary = {
      id: 'league-1',
      name: 'Summer League',
      member_count: 10,
      user_rank: 1,
      ends_on: '2026-04-19',
    }

    const insights = computeInsights({ ...basePayload, myLeagues: [league] })

    expect(insights.find(i => i.id === 'league-ending')).toBeUndefined()
  })

  it('still flags a league genuinely inside the 7-day window', () => {
    const league: MyLeagueSummary = {
      id: 'league-1',
      name: 'Summer League',
      member_count: 10,
      user_rank: 1,
      ends_on: '2026-04-18',
    }

    const insights = computeInsights({ ...basePayload, myLeagues: [league] })

    const insight = insights.find(i => i.id === 'league-ending')
    expect(insight).toBeDefined()
    expect(insight?.body).toContain('7 days remaining')
  })
})
