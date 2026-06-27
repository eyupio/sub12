import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { UserAvatar } from '../UserAvatar'

// Rendered without a profile link or hover card so the component needs no
// router/query context — we only exercise the avatar image vs. generated
// initials fallback.
function renderAvatar(user: { id?: string; display_name?: string; avatar_url?: string | null }) {
  return render(<UserAvatar user={user} showHoverCard={false} />)
}

describe('UserAvatar', () => {
  it('renders the avatar image when avatar_url is set', () => {
    renderAvatar({ display_name: 'Jane Doe', avatar_url: '/api/v1/images/abc' })
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe('/api/v1/images/abc')
  })

  it('renders generated initials when avatar_url is absent', () => {
    renderAvatar({ display_name: 'Jane Doe' })
    expect(screen.queryByRole('img')).not.toBeNull()
    expect(screen.getByText('JD')).toBeTruthy()
    // The generated avatar is a styled span, not an <img>.
    expect(document.querySelector('img')).toBeNull()
  })

  it('falls back to generated initials when the avatar image fails to load', () => {
    renderAvatar({ display_name: 'Jane Doe', avatar_url: '/api/v1/images/gone' })
    const img = document.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    fireEvent.error(img)
    // After the image errors, the broken <img> is replaced by the initials.
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('JD')).toBeTruthy()
  })
})
