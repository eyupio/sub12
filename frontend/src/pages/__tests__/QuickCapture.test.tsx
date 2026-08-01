import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import QuickCapture from '../QuickCapture'
import { gearApi, type Pellet, type Rifle } from '../../api/gear'
import { scoreCardApi, type ScoreCard } from '../../api/scoreCards'
import { pelletTestApi } from '../../api/pelletTesting'
import { locationsApi, type Location } from '../../api/locations'

const navigate = vi.fn()
let search: Record<string, string> = {}

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearch: () => search,
    Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  }
})

// The real editor draws to a canvas, which jsdom cannot do; stand in with a
// pass-through so the file reaches the page state.
vi.mock('../../components/ImageEditor', () => ({
  ImageEditor: ({ file, onSave }: { file: File; onSave: (f: File) => void }) => (
    <button type="button" onClick={() => onSave(file)}>Accept photo</button>
  ),
}))

function makeRifle(partial: Partial<Rifle> = {}): Rifle {
  return {
    id: 'rifle-1',
    user_id: 'user-1',
    make: 'Weihrauch',
    model: 'HW100',
    calibre: '.177',
    is_active: true,
    comparison_opt_in: true,
    created_at: '2026-07-23T00:00:00Z',
    updated_at: '2026-07-23T00:00:00Z',
    ...partial,
  }
}

function makePellet(partial: Partial<Pellet> = {}): Pellet {
  return {
    id: 'pellet-1',
    user_id: 'user-1',
    brand: 'JSB',
    model: 'Exact',
    is_active: true,
    comparison_opt_in: true,
    created_at: '2026-07-23T00:00:00Z',
    updated_at: '2026-07-23T00:00:00Z',
    ...partial,
  }
}

function makeCard(partial: Partial<ScoreCard> = {}): ScoreCard {
  return {
    id: 'card-1',
    user_id: 'user-1',
    shot_at: '2026-07-23',
    total_score: 0,
    x_count: 0,
    verification: 'pending',
    visibility: 'public',
    is_draft: true,
    shot_scores: [],
    shot_xs: [],
    created_at: '2026-07-23T00:00:00Z',
    updated_at: '2026-07-23T00:00:00Z',
    like_count: 0,
    comment_count: 0,
    is_liked: false,
    is_pb: false,
    ...partial,
  }
}

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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <QuickCapture />
    </QueryClientProvider>,
  )
}

// The photo input is hidden and driven by a ref, so attach the file directly.
function attachPhoto() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['x'], 'card.jpg', { type: 'image/jpeg' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
  return file
}

describe('QuickCapture gear selection', () => {
  beforeEach(() => {
    search = {}
    navigate.mockReset()
    vi.spyOn(gearApi, 'listRifles').mockResolvedValue({ items: [makeRifle()] })
    vi.spyOn(gearApi, 'listPellets').mockResolvedValue({ items: [makePellet()] })
    vi.spyOn(locationsApi, 'list').mockResolvedValue({ items: [] })
    vi.spyOn(scoreCardApi, 'list').mockResolvedValue(
      { items: [] } as Awaited<ReturnType<typeof scoreCardApi.list>>,
    )
    vi.spyOn(pelletTestApi, 'list').mockResolvedValue(
      { items: [] } as Awaited<ReturnType<typeof pelletTestApi.list>>,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saves a score-card draft with no rifle or pellet selected', async () => {
    const quickCreate = vi.spyOn(scoreCardApi, 'quickCreate').mockResolvedValue(makeCard())
    const uploadImage = vi
      .spyOn(scoreCardApi, 'uploadImage')
      .mockResolvedValue({ card_image_url: '/images/card-1' })

    renderPage()
    await screen.findByRole('button', { name: /Weihrauch/ })

    // Photo is the only hard requirement for a score card.
    expect(screen.getByText('Add a photo to save your draft.')).toBeInTheDocument()

    attachPhoto()
    // The editor sits between picking a file and having a photo; accept as-is.
    fireEvent.click(await screen.findByRole('button', { name: /Accept photo/i }))

    const save = await screen.findByRole('button', { name: /Save Draft/i })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    await waitFor(() => expect(quickCreate).toHaveBeenCalled())
    expect(quickCreate.mock.calls[0][0]).toMatchObject({ rifle_id: undefined, pellet_id: undefined })
    expect(uploadImage).toHaveBeenCalled()
  })

  it('offers saved places by name and sends the place id with the draft', async () => {
    vi.spyOn(locationsApi, 'list').mockResolvedValue({ items: [makePlace()] })
    const quickCreate = vi.spyOn(scoreCardApi, 'quickCreate').mockResolvedValue(makeCard())
    vi.spyOn(scoreCardApi, 'uploadImage').mockResolvedValue({ card_image_url: '/images/card-1' })

    renderPage()
    const select = await screen.findByLabelText('Saved place')
    // The place reads as its name — coordinates never stand in for it.
    expect(await screen.findByRole('option', { name: 'Ilkley Range' })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'place-1' } })
    await waitFor(() => expect(screen.getAllByText('Ilkley Range').length).toBeGreaterThan(1))

    attachPhoto()
    fireEvent.click(await screen.findByRole('button', { name: /Accept photo/i }))
    const save = await screen.findByRole('button', { name: /Save Draft/i })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    await waitFor(() => expect(quickCreate).toHaveBeenCalled())
    expect(quickCreate.mock.calls[0][0]).toMatchObject({
      location: 'Ilkley Range',
      location_id: 'place-1',
      location_lat: 53.862,
      location_lng: -1.957,
    })
  })

  it('marks rifle and pellet optional for a score card, required for a pellet test', async () => {
    renderPage()
    await screen.findByRole('button', { name: /Weihrauch/ })

    expect(screen.getByRole('button', { name: /No rifle/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /No pellet/ })).toBeInTheDocument()

    // A pellet test is defined by its rifle/pellet pairing — no skipping.
    fireEvent.click(screen.getByRole('radio', { name: /Pellet test/ }))
    expect(screen.queryByRole('button', { name: /No rifle/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /No pellet/ })).not.toBeInTheDocument()
  })

  it('creates and selects a new rifle without leaving the page', async () => {
    const added = makeRifle({ id: 'rifle-2', make: 'Air Arms', model: 'S510' })
    const createRifle = vi.spyOn(gearApi, 'createRifle').mockImplementation(async () => {
      vi.mocked(gearApi.listRifles).mockResolvedValue({ items: [makeRifle(), added] })
      return added
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /New rifle/ }))

    // CatalogSearch commits its options on mousedown, ahead of blur.
    fireEvent.mouseDown(screen.getByText(/or enter manually/i))
    fireEvent.change(screen.getByPlaceholderText('Weihrauch'), { target: { value: 'Air Arms' } })
    fireEvent.change(screen.getByPlaceholderText('HW100'), { target: { value: 'S510' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Rifle/i }))

    await waitFor(() => expect(createRifle).toHaveBeenCalled())
    expect(createRifle.mock.calls[0][0]).toMatchObject({ make: 'Air Arms', model: 'S510' })
    // The form closes and the new rifle becomes the selection — the hero
    // summary only names a rifle once one is picked.
    expect(screen.queryByRole('button', { name: /Add Rifle/i })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Air Arms').length).toBeGreaterThanOrEqual(2))
  })

  it('creates and selects a new pellet without leaving the page', async () => {
    const createPellet = vi
      .spyOn(gearApi, 'createPellet')
      .mockResolvedValue(makePellet({ id: 'pellet-2', brand: 'H&N', model: 'Field Target Trophy' }))

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /New pellet/ }))

    fireEvent.mouseDown(screen.getByText(/or enter manually/i))
    fireEvent.change(screen.getByPlaceholderText('JSB'), { target: { value: 'H&N' } })
    fireEvent.change(screen.getByPlaceholderText('Match Exact'), { target: { value: 'Field Target Trophy' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Pellet/i }))

    await waitFor(() => expect(createPellet).toHaveBeenCalled())
    expect(createPellet.mock.calls[0][0]).toMatchObject({ brand: 'H&N', model: 'Field Target Trophy' })
    expect(screen.queryByRole('button', { name: /Add Pellet/i })).not.toBeInTheDocument()
  })
})
