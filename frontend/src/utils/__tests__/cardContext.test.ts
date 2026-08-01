import { describe, expect, it } from 'vitest'

import { contextChangePlan, contextOfCard } from '../cardContext'

describe('contextOfCard', () => {
  it('reads the card\'s current context', () => {
    expect(contextOfCard({})).toBe('personal')
    expect(contextOfCard({ club_id: 'club-1' })).toBe('club')
    // A league card usually carries a club too; the league wins.
    expect(contextOfCard({ league_round_id: 'round-1', club_id: 'club-1' })).toBe('league')
  })
})

describe('contextChangePlan', () => {
  it('detaches a league card that becomes personal', () => {
    const plan = contextChangePlan({ target: 'personal', currentRoundId: 'round-1' })
    expect(plan.patch).toEqual({ league_round_id: '' })
    expect(plan.submitRoundId).toBeUndefined()
  })

  it('clears the club when a club card becomes personal', () => {
    const plan = contextChangePlan({ target: 'personal', currentClubId: 'club-1' })
    expect(plan.patch).toEqual({ club_id: '' })
  })

  it('sends nothing when a personal card stays personal', () => {
    expect(contextChangePlan({ target: 'personal' }).patch).toEqual({})
  })

  it('attaches through submit-to-league, never through the PATCH', () => {
    const plan = contextChangePlan({ target: 'league', targetRoundId: 'round-2' })
    expect(plan.patch).toEqual({})
    expect(plan.submitRoundId).toBe('round-2')
  })

  it('moves a card between rounds', () => {
    const plan = contextChangePlan({
      target: 'league',
      targetRoundId: 'round-2',
      currentRoundId: 'round-1',
    })
    expect(plan.submitRoundId).toBe('round-2')
  })

  it('does nothing when the card is already in the target round', () => {
    const plan = contextChangePlan({
      target: 'league',
      targetRoundId: 'round-1',
      currentRoundId: 'round-1',
    })
    expect(plan.submitRoundId).toBeUndefined()
    expect(plan.patch).toEqual({})
  })

  it('reports a league target with no round yet, so the caller can wait', () => {
    expect(contextChangePlan({ target: 'league' }).needsRound).toBe(true)
  })

  it('takes a league card out of its round when it becomes a club card', () => {
    const plan = contextChangePlan({
      target: 'club',
      targetClubId: 'club-2',
      currentRoundId: 'round-1',
      currentClubId: 'club-1',
    })
    expect(plan.patch).toEqual({ league_round_id: '', club_id: 'club-2' })
    expect(plan.submitRoundId).toBeUndefined()
  })

  it('leaves an unchanged club alone', () => {
    const plan = contextChangePlan({
      target: 'club',
      targetClubId: 'club-1',
      currentClubId: 'club-1',
    })
    expect(plan.patch).toEqual({})
  })
})
