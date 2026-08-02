import type { ComponentProps, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import IndexPage from '../IndexPage'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../../store/auth', () => ({
  useAuthStore: (selector: (state: { accessToken: null; user: null }) => unknown) =>
    selector({ accessToken: null, user: null }),
}))

vi.mock('../Dashboard', () => ({ default: () => <div /> }))
vi.mock('../../components/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const isNative = vi.mocked(Capacitor.isNativePlatform)

describe('IndexPage (signed out)', () => {
  beforeEach(() => {
    isNative.mockReturnValue(false)
  })

  it('shows the marketing landing page on the web', () => {
    render(<IndexPage />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
  })

  it('shows the app welcome screen with coming soon inside the native shell', () => {
    isNative.mockReturnValue(true)
    render(<IndexPage />)

    expect(
      screen.getByRole('heading', { name: /the full sub12 mobile experience is coming soon/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/register')

    // None of the marketing site should leak into the native welcome: no
    // sticky header, no APK download link.
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /download apk/i })).not.toBeInTheDocument()
  })
})
