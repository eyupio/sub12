import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import SetupWizard from '../SetupWizard'
import { siteApi } from '../../api/site'
import { authApi } from '../../api/auth'
import { ApiError } from '../../api/client'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../../api/site', async () => {
  const actual = await vi.importActual<typeof import('../../api/site')>('../../api/site')
  return {
    ...actual,
    siteApi: { branding: vi.fn(), setupStatus: vi.fn(), completeSetup: vi.fn() },
  }
})
vi.mock('../../api/auth', () => ({ authApi: { login: vi.fn() } }))

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SetupWizard />
    </QueryClientProvider>,
  )
}

async function advance(times: number) {
  for (let i = 0; i < times; i++) {
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(siteApi.setupStatus).mockResolvedValue({ needs_setup: true })
})

describe('SetupWizard', () => {
  it('sends the operator to sign in when the deployment is already set up', async () => {
    vi.mocked(siteApi.setupStatus).mockResolvedValue({ needs_setup: false })
    renderWizard()
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true }),
    )
  })

  it('will not finish without an administrator', async () => {
    renderWizard()
    await screen.findByText(/This installation is yours to name/i)

    // Skip through to the administrator step leaving it blank; the stepper
    // must not offer a route past it, or setup would complete with no account
    // and the deployment would be unreachable.
    await advance(4)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('creates the administrator, then signs in through the ordinary login', async () => {
    vi.mocked(siteApi.completeSetup).mockResolvedValue({
      settings: {} as never,
      admin_id: 'user-1',
    })
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'complete',
      user: { id: 'user-1' } as never,
      tokens: { access_token: 'a', refresh_token: 'r', expires_in: 60 },
    })

    renderWizard()
    await screen.findByText(/This installation is yours to name/i)

    await advance(1) // deployment shape — community is the default
    await advance(1) // identity
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dale Head Rifle Club' } })
    await advance(1) // look
    await advance(1) // administrator

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ops' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@example.org' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct-horse' } })
    await advance(1) // review

    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }))

    await waitFor(() => expect(siteApi.completeSetup).toHaveBeenCalled())
    const payload = vi.mocked(siteApi.completeSetup).mock.calls[0][0]
    expect(payload.site_name).toBe('Dale Head Rifle Club')
    expect(payload.deployment_mode).toBe('community')
    expect(payload.admin).toEqual({
      email: 'ops@example.org',
      display_name: 'Ops',
      password: 'correct-horse',
    })
    // A community deployment creates no club.
    expect(payload.club).toBeUndefined()

    // Setup returns no tokens on purpose: the session is minted by the same
    // login endpoint every other sign-in uses.
    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith('ops@example.org', 'correct-horse'))
  })

  it('carries the club through in single-club mode', async () => {
    vi.mocked(siteApi.completeSetup).mockResolvedValue({ settings: {} as never, admin_id: 'u' })
    vi.mocked(authApi.login).mockRejectedValue(new Error('nope'))

    renderWizard()
    await screen.findByText(/This installation is yours to name/i)
    await advance(1)

    fireEvent.click(screen.getByRole('button', { name: /One club/i }))
    fireEvent.change(screen.getByLabelText('Club name'), { target: { value: 'Dale Head RC' } })
    await advance(1)

    // The club's name stands in for the site name unless one is typed.
    expect(screen.getByText(/Using your club's name: Dale Head RC/)).toBeInTheDocument()
    await advance(3)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ops' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@example.org' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct-horse' } })
    await advance(1)

    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }))
    await waitFor(() => expect(siteApi.completeSetup).toHaveBeenCalled())
    const payload = vi.mocked(siteApi.completeSetup).mock.calls[0][0]
    expect(payload.deployment_mode).toBe('single_club')
    expect(payload.site_name).toBe('Dale Head RC')
    expect(payload.club?.name).toBe('Dale Head RC')

    // A failed sign-in is not a failed setup — the deployment is up, so the
    // operator is put on the login form rather than left on a dead wizard.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true }))
  })

  it('explains a deployment that was set up while the wizard was open', async () => {
    vi.mocked(siteApi.completeSetup).mockRejectedValue(new ApiError(409, 'already set up'))

    renderWizard()
    await screen.findByText(/This installation is yours to name/i)
    await advance(2)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Club' } })
    await advance(2)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ops' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@example.org' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct-horse' } })
    await advance(1)

    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }))
    expect(await screen.findByText(/already been set up/i)).toBeInTheDocument()
    expect(authApi.login).not.toHaveBeenCalled()
  })
})
