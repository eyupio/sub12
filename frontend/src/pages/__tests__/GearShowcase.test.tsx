import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RifleShowcase } from '../GearShowcase'
import { gearApi, type GearCommunity, type RifleShowcase as RifleShowcaseData } from '../../api/gear'
import { routeTree } from '../../routeTree'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useParams: () => ({ id: 'rifle-1' }),
    Link: ({ to, params, children, ...props }: {
      to: string
      params?: Record<string, string>
      children: ReactNode
    } & Omit<ComponentProps<'a'>, 'href'>) => {
      // Resolve $id-style segments so the rendered href is the real target.
      const href = Object.entries(params ?? {}).reduce(
        (acc, [key, value]) => acc.replace(`$${key}`, value),
        to,
      )
      return <a href={href} {...props}>{children}</a>
    },
  }
})

// Recharts measures its container, which jsdom reports as 0x0, so the charts
// render nothing. The page's own copy and controls are what these tests assert.
vi.mock('../../components/GearCharts', async () => {
  const actual = await vi.importActual<typeof import('../../components/GearCharts')>('../../components/GearCharts')
  return {
    ...actual,
    ScoreTrendChart: () => <div data-testid="score-trend" />,
    DistributionChart: () => <div data-testid="distribution" />,
    ShotBreakdownChart: () => <div data-testid="shot-breakdown" />,
    GroupTrendChart: () => <div data-testid="group-trend" />,
  }
})

function makeCommunity(partial: Partial<GearCommunity> = {}): GearCommunity {
  return {
    opted_in: true,
    eligible: true,
    min_owners: 3,
    owner_count: 12,
    card_count: 340,
    test_count: 22,
    avg_score: 228.4,
    median_score: 229,
    p90_score: 240,
    best_score: 249,
    avg_x_count: 6.1,
    your_percentile: 88,
    your_rank: 2,
    distribution: [{ label: '245-250', min: 245, max: 250, count: 40 }],
    trend: [{ period: '2026-01-01', avg_score: 228, avg_x_count: 6, std_dev: 5, card_count: 30 }],
    top_pairings: [],
    leaders: [],
    group_leaders: [],
    ...partial,
  }
}

function makeShowcase(partial: Partial<RifleShowcaseData> = {}): RifleShowcaseData {
  return {
    rifle: {
      id: 'rifle-1',
      user_id: 'user-1',
      make: 'Weihrauch',
      model: 'HW100',
      calibre: '.177',
      power_ftlb: 11.5,
      is_active: true,
      comparison_opt_in: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    model_key: 'weihrauch|hw100',
    personal: {
      card_count: 24,
      shots_fired: 600,
      best_score: 241,
      best_x_count: 9,
      avg_score: 231.5,
      avg_x_count: 5.2,
      std_dev: 4.3,
      rolling_10_avg: 234,
      first_used: '2026-01-04',
      last_used: '2026-07-20',
      active_days: 18,
      test_count: 3,
      group_count: 9,
      best_group_mm: 11.4,
      avg_group_mm: 14.2,
      perfect_shots: 120,
      x_percentage: 20.8,
    },
    score_trend: [{ period: '2026-01-01', avg_score: 230, avg_x_count: 5, std_dev: 4, card_count: 6 }],
    score_distribution: [{ label: '235-244', min: 235, max: 244, count: 12 }],
    shot_breakdown: [{ value: 10, count: 120 }],
    group_trend: [],
    pairings: [],
    recent_cards: [],
    community: makeCommunity(),
    ...partial,
  }
}

function renderShowcase() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RifleShowcase />
    </QueryClientProvider>,
  )
}

describe('RifleShowcase', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the rifle identity and headline stats', async () => {
    vi.spyOn(gearApi, 'getRifleShowcase').mockResolvedValue(makeShowcase())

    renderShowcase()

    expect(await screen.findByText('Weihrauch HW100')).toBeInTheDocument()
    expect(screen.getByText('241')).toBeInTheDocument()   // best score
    expect(screen.getByText('231.5')).toBeInTheDocument() // average
    expect(screen.getByText('11.40 mm')).toBeInTheDocument()
  })

  it('reports the viewer standing as a top-N percentage on the comparison tab', async () => {
    vi.spyOn(gearApi, 'getRifleShowcase').mockResolvedValue(makeShowcase())

    renderShowcase()
    await screen.findByText('Weihrauch HW100')
    fireEvent.click(screen.getByRole('tab', { name: /comparison/i }))

    // 88th percentile reads as "Top 12%".
    expect(await screen.findByText('Top 12%')).toBeInTheDocument()
    expect(screen.getByText('Rank 2 of 12')).toBeInTheDocument()
    expect(screen.getByText(/12 opted-in owners/)).toBeInTheDocument()
  })

  // Opting out is the privacy promise: no community figures in, none out.
  it('hides every community figure when the item is opted out', async () => {
    vi.spyOn(gearApi, 'getRifleShowcase').mockResolvedValue(makeShowcase({
      rifle: { ...makeShowcase().rifle, comparison_opt_in: false },
      community: {
        opted_in: false,
        eligible: false,
        min_owners: 3,
        owner_count: 0,
        card_count: 0,
        test_count: 0,
        distribution: [],
        trend: [],
        top_pairings: [],
        leaders: [],
        group_leaders: [],
      },
    }))

    renderShowcase()
    await screen.findByText('Weihrauch HW100')
    fireEvent.click(screen.getByRole('tab', { name: /comparison/i }))

    expect(await screen.findByText('Excluded from public comparison')).toBeInTheDocument()
    expect(screen.getByText('Comparison is off for this item')).toBeInTheDocument()
    expect(screen.queryByText(/Top \d+%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/opted-in owners/)).not.toBeInTheDocument()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  // Below the k-anonymity floor the aggregate is suppressed, not just hidden.
  it('explains the shortfall when too few owners have opted in', async () => {
    vi.spyOn(gearApi, 'getRifleShowcase').mockResolvedValue(makeShowcase({
      community: makeCommunity({
        eligible: false,
        owner_count: 1,
        card_count: 0,
        avg_score: undefined,
        best_score: undefined,
        your_percentile: undefined,
        your_rank: undefined,
      }),
    }))

    renderShowcase()
    await screen.findByText('Weihrauch HW100')
    fireEvent.click(screen.getByRole('tab', { name: /comparison/i }))

    expect(await screen.findByText('Not enough shooters yet')).toBeInTheDocument()
    expect(screen.getByText(/2 more to go/)).toBeInTheDocument()
    expect(screen.queryByText(/Top \d+%/)).not.toBeInTheDocument()
  })

  it('writes the opt-in change through to the rifle', async () => {
    vi.spyOn(gearApi, 'getRifleShowcase').mockResolvedValue(makeShowcase())
    const update = vi.spyOn(gearApi, 'updateRifle').mockResolvedValue(makeShowcase().rifle)

    renderShowcase()
    await screen.findByText('Weihrauch HW100')
    fireEvent.click(screen.getByRole('tab', { name: /comparison/i }))
    fireEvent.click(await screen.findByRole('switch'))

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith('rifle-1', { comparison_opt_in: false })
    })
  })

  it('surfaces a recoverable error rather than a blank page', async () => {
    vi.spyOn(gearApi, 'getRifleShowcase').mockRejectedValue(new Error('boom'))

    renderShowcase()

    expect(await screen.findByText(/couldn’t load this rifle/i)).toBeInTheDocument()
  })
})

describe('gear showcase routes', () => {
  it('registers both showcase paths and the admin gear dashboard', () => {
    const paths: string[] = []
    const queue: unknown[] = [routeTree]

    while (queue.length) {
      const current = queue.shift() as { options?: { path?: string }; children?: unknown[] }
      if (current?.options?.path) paths.push(current.options.path)
      if (Array.isArray(current?.children)) queue.push(...current.children)
    }

    expect(paths).toContain('/gear/rifles/$id')
    expect(paths).toContain('/gear/pellets/$id')
    expect(paths).toContain('/admin/gear')
  })
})
