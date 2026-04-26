import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
}))

import { LocationMapThumbnail } from '../LocationMapThumbnail'

describe('LocationMapThumbnail', () => {
  it('renders a clickable thumbnail and expands the map', () => {
    render(<LocationMapThumbnail label="Bisley" lat={51.31} lng={-0.62} />)

    fireEvent.click(screen.getByRole('button', { name: /open map for bisley/i }))

    expect(screen.getByRole('dialog', { name: /map for bisley/i })).toBeInTheDocument()
    expect(screen.getAllByTestId('map')).toHaveLength(2)
    expect(screen.getAllByText('51.31000, -0.62000')).toHaveLength(2)
  })

  it('falls back to plain text when coordinates are missing', () => {
    render(<LocationMapThumbnail label="Typed only" />)

    expect(screen.getByText('Typed only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open map/i })).not.toBeInTheDocument()
  })
})
