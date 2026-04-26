import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { LocationField, type LocationValue } from '../LocationField'
import { scoreCardApi } from '../../api/scoreCards'
import { pelletTestApi } from '../../api/pelletTesting'

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
    const getCurrentPosition = vi.fn(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: 51.5,
            longitude: -0.12,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition)
      },
    )
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })

    const { onChange } = renderField()
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(last.lat).toBeCloseTo(51.5, 5)
    expect(last.lng).toBeCloseTo(-0.12, 5)
    expect(last.label).toMatch(/51\.500/)
  })

  it('clicking "Use my location" preserves a non-empty label', async () => {
    const getCurrentPosition = vi.fn(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: 12.34,
            longitude: 56.78,
            accuracy: 1,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: 0,
        } as GeolocationPosition)
      },
    )
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })

    const { onChange } = renderField({ label: 'My Range' })
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0].label).toBe('My Range')
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
