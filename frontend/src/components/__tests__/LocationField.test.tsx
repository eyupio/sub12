import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { LocationField, type LocationValue } from '../LocationField'
import { scoreCardApi } from '../../api/scoreCards'
import { pelletTestApi } from '../../api/pelletTesting'
import { locationsApi, type Location } from '../../api/locations'

function makePlace(partial: Partial<Location> = {}): Location {
  return {
    id: 'place-1',
    user_id: 'user-1',
    name: 'Ilkley Range',
    lat: 53.862,
    lng: -1.957,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...partial,
  }
}

function mockGeolocation(latitude: number, longitude: number) {
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    success({
      coords: {
        latitude,
        longitude,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: 0,
    } as GeolocationPosition)
  })
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
  return getCurrentPosition
}

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function renderField(initial: LocationValue = { label: '' }) {
  const onChange = vi.fn<(next: LocationValue) => void>()
  let current = initial
  function Harness() {
    return (
      <LocationField
        value={current}
        onChange={(n) => {
          current = n
          onChange(n)
        }}
      />
    )
  }
  const utils = render(
    <Wrapper>
      <Harness />
    </Wrapper>,
  )
  return { onChange, ...utils }
}

describe('LocationField', () => {
  beforeEach(() => {
    vi.spyOn(scoreCardApi, 'list').mockResolvedValue({ items: [] } as Awaited<ReturnType<typeof scoreCardApi.list>>)
    vi.spyOn(pelletTestApi, 'list').mockResolvedValue({ items: [] } as Awaited<ReturnType<typeof pelletTestApi.list>>)
    vi.spyOn(locationsApi, 'list').mockResolvedValue({ items: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits the typed label as the user changes the input', () => {
    const { onChange } = renderField()
    const input = screen.getByPlaceholderText('Range / club') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Bisley' } })
    expect(onChange).toHaveBeenCalledWith({ label: 'Bisley' })
  })

  it('clicking "Use my location" populates coords and auto-seeds the label when empty', async () => {
    const getCurrentPosition = mockGeolocation(51.5, -0.12)

    const { onChange } = renderField()
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    )
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(last.lat).toBeCloseTo(51.5, 5)
    expect(last.lng).toBeCloseTo(-0.12, 5)
    expect(last.label).toMatch(/51\.500/)
  })

  it('clicking "Use my location" preserves a non-empty label', async () => {
    mockGeolocation(12.34, 56.78)

    const { onChange } = renderField({ label: 'My Range' })
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0].label).toBe('My Range')
  })

  it('names the saved place instead of coordinates when geolocation lands on one', async () => {
    vi.spyOn(locationsApi, 'list').mockResolvedValue({ items: [makePlace()] })
    mockGeolocation(53.862, -1.9575)

    const { onChange } = renderField()
    // Wait for the saved places to land, otherwise the click races the query.
    await waitFor(() => expect(locationsApi.list).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use my location/i })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    await waitFor(() =>
      expect(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0].label).toBe('Ilkley Range'),
    )
  })

  it('lists a recent card shot at a saved place under that place name', async () => {
    vi.spyOn(locationsApi, 'list').mockResolvedValue({ items: [makePlace()] })
    vi.spyOn(scoreCardApi, 'list').mockResolvedValue({
      items: [
        {
          id: 'a',
          shot_at: '2026-01-01',
          total_score: 0,
          x_count: 0,
          // Stored before the place existed, so the label is raw coordinates.
          location: '53.862, -1.957',
          location_lat: 53.862,
          location_lng: -1.957,
          verification: 'verified',
          is_draft: false,
          created_at: '',
        },
      ],
    } as Awaited<ReturnType<typeof scoreCardApi.list>>)

    renderField()
    expect(await screen.findByRole('button', { name: 'Ilkley Range' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '53.862, -1.957' })).not.toBeInTheDocument()
  })

  it('renders a chip per recent score-card location and restores label + coords on click', async () => {
    vi.spyOn(scoreCardApi, 'list').mockResolvedValue({
      items: [
        {
          id: 'a',
          shot_at: '2026-01-01',
          total_score: 0,
          x_count: 0,
          location: 'Bisley',
          location_lat: 51.31,
          location_lng: -0.62,
          verification: 'verified',
          is_draft: false,
          created_at: '',
        },
      ],
    } as Awaited<ReturnType<typeof scoreCardApi.list>>)

    const { onChange } = renderField()
    const chip = await screen.findByRole('button', { name: 'Bisley' })
    fireEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith({ label: 'Bisley', lat: 51.31, lng: -0.62 })
  })
})
