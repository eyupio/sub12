import type { ComponentProps, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PelletProfileCard } from '../PelletProfileCard'
import { RifleProfileCard } from '../RifleProfileCard'
import type { Pellet, Rifle } from '../../api/gear'

const linkClick = vi.fn()

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, params, children, ...props }: {
      to: string
      params?: Record<string, string>
      children?: ReactNode
    } & Omit<ComponentProps<'a'>, 'href'>) => {
      const href = Object.entries(params ?? {}).reduce(
        (acc, [key, value]) => acc.replace(`$${key}`, value),
        to,
      )
      // A real Link navigates from its own click handler, so a spy here stands
      // in for "the showcase page opened".
      return <a href={href} onClick={linkClick} {...props}>{children}</a>
    },
  }
})

const rifle: Rifle = {
  id: 'rifle-1',
  user_id: 'u1',
  make: 'Air Arms',
  model: 'S400',
  calibre: '.177',
  is_active: true,
  comparison_opt_in: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const pellet: Pellet = {
  id: 'pellet-1',
  user_id: 'u1',
  brand: 'JSB',
  model: 'Exact Express',
  is_active: true,
  comparison_opt_in: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function spyOnFileInput() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const inputClick = vi.fn()
  input.addEventListener('click', inputClick)
  return inputClick
}

describe('gear profile cards', () => {
  beforeEach(() => {
    linkClick.mockClear()
  })

  it.each([
    ['rifle', () => render(<RifleProfileCard rifle={rifle} mode="gear" onUploadImage={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)],
    ['pellet', () => render(<PelletProfileCard pellet={pellet} onUploadImage={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)],
  ])('opens the %s file picker from the photo and the action bar', (_kind, renderCard) => {
    renderCard()
    const inputClick = spyOnFileInput()

    // The photo itself and the labelled action both change the photo.
    const controls = screen.getAllByLabelText('Change photo')
    expect(controls).toHaveLength(2)
    controls.forEach(control => fireEvent.click(control))

    expect(inputClick).toHaveBeenCalledTimes(2)
    expect(linkClick).not.toHaveBeenCalled()
  })

  it.each([
    ['rifle', () => render(<RifleProfileCard rifle={rifle} mode="gear" onUploadImage={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)],
    ['pellet', () => render(<PelletProfileCard pellet={pellet} onUploadImage={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)],
  ])('keeps the %s controls out of the showcase link', (_kind, renderCard) => {
    renderCard()
    const link = screen.getByRole('link')

    // Structural guarantee: a control that is not a descendant of the anchor
    // cannot navigate, however the click is delivered.
    for (const label of ['Change photo', 'Edit rifle', 'Edit pellet', 'Delete rifle', 'Delete pellet']) {
      for (const control of screen.queryAllByLabelText(label)) {
        expect(link.contains(control)).toBe(false)
      }
    }
  })

  it.each([
    ['rifle', () => render(<RifleProfileCard rifle={rifle} mode="gear" onUploadImage={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />), 'Edit rifle', 'Delete rifle'],
    ['pellet', () => render(<PelletProfileCard pellet={pellet} onUploadImage={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />), 'Edit pellet', 'Delete pellet'],
  ] as const)('labels the %s edit and delete actions in words', (_kind, renderCard, editLabel, deleteLabel) => {
    renderCard()

    expect(screen.getByLabelText(editLabel)).toHaveTextContent('Edit')
    expect(screen.getByLabelText(deleteLabel)).toHaveTextContent('Delete')
  })

  it('runs the edit and delete callbacks without navigating', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<PelletProfileCard pellet={pellet} onUploadImage={vi.fn()} onEdit={onEdit} onDelete={onDelete} />)

    fireEvent.click(screen.getByLabelText('Edit pellet'))
    fireEvent.click(screen.getByLabelText('Delete pellet'))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(linkClick).not.toHaveBeenCalled()
  })

  it('leaves the profile card without owner controls', () => {
    render(<RifleProfileCard rifle={rifle} mode="profile" />)

    expect(screen.queryByLabelText('Change photo')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
