import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LeagueHero } from '../LeagueDetail'

const base = {
  thumb: <div />,
  title: 'Public League',
  memberCount: 4,
  faces: [
    { id: '1', name: 'Paul', avatarUrl: null },
    { id: '2', name: 'Harper Quill', avatarUrl: null },
  ],
  cardCount: 12,
  pendingCount: 0,
  rankedCount: 4,
  scoreLabel: 'Best',
}

describe('LeagueHero', () => {
  it('leads with the league figures a shooter opens the page for', () => {
    render(
      <LeagueHero
        {...base}
        pendingCount={2}
        leader={{ rank: 1, name: 'Paul', score: 227, x: 2 }}
        me={{ rank: 2, name: 'Admin', score: 207, x: 0 }}
      />,
    )

    expect(screen.getByText('4')).toBeInTheDocument()          // shooters
    expect(screen.getByText('12')).toBeInTheDocument()         // cards
    expect(screen.getByText('2 awaiting review')).toBeInTheDocument()
    expect(screen.getByText('Paul')).toBeInTheDocument()
    expect(screen.getByText('Best 227 · 2X')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('20 off the lead')).toBeInTheDocument()
  })

  it('says you are leading rather than reporting a gap to yourself', () => {
    render(
      <LeagueHero
        {...base}
        leader={{ rank: 1, name: 'Admin', score: 227, x: 2 }}
        me={{ rank: 1, name: 'Admin', score: 227, x: 2 }}
      />,
    )

    expect(screen.getByText('Leading the league')).toBeInTheDocument()
  })

  it('holds its shape before anyone has submitted a card', () => {
    render(<LeagueHero {...base} memberCount={0} faces={[]} cardCount={0} rankedCount={0} leader={null} me={null} />)

    expect(screen.getByText('Nobody has shot yet')).toBeInTheDocument()
    expect(screen.getByText('None submitted')).toBeInTheDocument()
    expect(screen.getByText('Top spot unclaimed')).toBeInTheDocument()
    expect(screen.getByText('Not on the board yet')).toBeInTheDocument()
  })

  // The average rule ranks on a mean, so the gap is rarely a whole number.
  it('rounds a fractional gap instead of printing float noise', () => {
    render(
      <LeagueHero
        {...base}
        scoreLabel="Avg"
        leader={{ rank: 1, name: 'Paul', score: 228.6, x: null }}
        me={{ rank: 3, name: 'Admin', score: 221.2, x: null }}
      />,
    )

    expect(screen.getByText('Avg 228.6')).toBeInTheDocument()
    expect(screen.getByText('7.4 off the lead')).toBeInTheDocument()
  })
})
