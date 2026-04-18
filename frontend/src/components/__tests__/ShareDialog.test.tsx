import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ShareDialog } from '../ShareDialog'
import { postApi } from '../../api/posts'
import { leagueApi } from '../../api/leagues'
import { clubsApi } from '../../api/clubs'
import { useToastStore } from '../../store/toast'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

function renderDialog(props?: Partial<Parameters<typeof ShareDialog>[0]>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  render(
    <Wrapper>
      <ShareDialog
        targetId="sc-1"
        targetType="score_card"
        targetLabel="Score Card"
        onClose={() => {}}
        {...props}
      />
    </Wrapper>,
  )

  return { queryClient, invalidateSpy }
}

describe('ShareDialog', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    useToastStore.setState({ toasts: [] })
    Object.assign(window, { location: { ...window.location, origin: 'https://app.test' } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shares to a selected league, invalidates the league posts cache, and navigates to the league', async () => {
    vi.spyOn(leagueApi, 'listMine').mockResolvedValue({
      items: [{ id: 'lg-1', name: 'Test League' }],
      cursor: '',
    } as unknown as Awaited<ReturnType<typeof leagueApi.listMine>>)
    const shareSpy = vi
      .spyOn(postApi, 'share')
      .mockResolvedValue({ id: 'post-1' } as unknown as Awaited<ReturnType<typeof postApi.share>>)

    const { invalidateSpy } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /^league$/i }))
    await screen.findByRole('option', { name: 'Test League' })
    const select = screen.getByRole('combobox', { name: /select a league/i })
    fireEvent.change(select, { target: { value: 'lg-1' } })
    expect((select as HTMLSelectElement).value).toBe('lg-1')
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }))

    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1))
    expect(shareSpy).toHaveBeenCalledWith({
      target_id: 'sc-1',
      target_type: 'score_card',
      body: undefined,
      league_id: 'lg-1',
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feed'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['league', 'lg-1', 'posts'] })
    })
    expect(navigateMock).toHaveBeenCalledWith({ to: '/leagues/$id', params: { id: 'lg-1' } })
  })

  it('copies the share link to the clipboard and toasts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://app.test/score-cards/sc-1')
    })
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => t.message === 'Link copied' && t.variant === 'success')).toBe(true)
  })

  it('opens Twitter/X intent in a new tab with the score-card url', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const clubsSpy = vi.spyOn(clubsApi, 'list')

    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /^x$/i }))

    const [hrefArg] = openSpy.mock.calls[0] ?? []
    expect(hrefArg).toContain('https://twitter.com/intent/tweet')
    expect(hrefArg).toContain(encodeURIComponent('https://app.test/score-cards/sc-1'))
    expect(clubsSpy).not.toHaveBeenCalled()
  })
})
