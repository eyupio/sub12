import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Help from '../Help'
import { faqApi, type FAQ } from '../../api/faq'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

function makeFaq(partial: Partial<FAQ> & Pick<FAQ, 'slug' | 'category' | 'question'>): FAQ {
  return {
    id: partial.slug,
    answer_md: 'Answer body.',
    sort_order: 10,
    category_order: 10,
    is_published: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

const faqs: FAQ[] = [
  makeFaq({
    slug: 'first-things-to-do',
    category: 'Getting Started',
    question: 'I have just signed up — what should I do first?',
    answer_md: 'Add a rifle, then log a card.',
    sort_order: 5,
  }),
  makeFaq({
    slug: 'moa-explained',
    category: 'Pellet Testing',
    question: 'What is MOA?',
    answer_md: 'Minute of Angle.',
    category_order: 20,
  }),
]

function renderHelp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Help />
    </QueryClientProvider>,
  )
}

describe('Help', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/help')
    vi.spyOn(faqApi, 'list').mockResolvedValue({ items: faqs })
  })

  it('offers new users a quick-start path before the article list', async () => {
    renderHelp()

    expect(screen.getByRole('heading', { name: /new to sub12\? start here/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add your rifle/i })).toHaveAttribute('href', '/gear')
    expect(screen.getByRole('link', { name: /log a score card/i })).toHaveAttribute('href', '/scores/new')

    await screen.findByRole('button', { name: /what is moa\?/i })
  })

  it('opens an article and records its slug in the URL so it can be shared', async () => {
    renderHelp()

    const trigger = await screen.findByRole('button', { name: /what is moa\?/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Minute of Angle.')).toBeInTheDocument()
    expect(window.location.hash).toBe('#moa-explained')

    fireEvent.click(trigger)
    expect(window.location.hash).toBe('')
  })

  it('opens the article named by the URL fragment on load', async () => {
    window.history.replaceState(null, '', '/help#moa-explained')
    renderHelp()

    const trigger = await screen.findByRole('button', { name: /what is moa\?/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Minute of Angle.')).toBeInTheDocument()
  })

  it('points a fruitless search at support rather than a dead end', async () => {
    renderHelp()
    await screen.findByRole('button', { name: /what is moa\?/i })

    fireEvent.change(screen.getByRole('searchbox', { name: /search help articles/i }), {
      target: { value: 'chronograph calibration' },
    })

    await waitFor(() => {
      expect(screen.getByText(/nothing matched/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Send us the question' })).toHaveAttribute('href', '/support')
  })
})
