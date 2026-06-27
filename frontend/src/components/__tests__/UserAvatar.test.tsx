import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { UserAvatar } from '../UserAvatar'

// Rendered without a profile link or hover card so the component needs no
// router/query context — we only exercise the avatar image vs. generated
// identicon fallback.
function renderAvatar(user: { id?: string; display_name?: string; avatar_url?: string | null }) {
  return render(<UserAvatar user={user} showHoverCard={false} />)
}

describe('UserAvatar', () => {
  it('renders the avatar image when avatar_url is set', () => {
    renderAvatar({ id: 'u1', display_name: 'Jane Doe', avatar_url: '/api/v1/images/abc' })
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/api/v1/images/abc')
  })

  it('renders a generated identicon when avatar_url is absent', () => {
    renderAvatar({ id: 'u1', display_name: 'Jane Doe' })
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/)
  })

  it('falls back to the generated identicon when the avatar image fails to load', () => {
    renderAvatar({ id: 'u1', display_name: 'Jane Doe', avatar_url: '/api/v1/images/gone' })
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/api/v1/images/gone')
    fireEvent.error(img)
    const fallback = screen.getByRole('img') as HTMLImageElement
    expect(fallback.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/)
  })
})
