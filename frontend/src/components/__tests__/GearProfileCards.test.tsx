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
      children: ReactNode
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

describe('gear profile cards', () => {
  beforeEach(() => {
    linkClick.mockClear()
  })

  it('opens the rifle file picker without navigating to the showcase', () => {
    render(<RifleProfileCard rifle={rifle} mode="gear" onUploadImage={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const inputClick = vi.fn()
    input.addEventListener('click', inputClick)

    fireEvent.click(screen.getByLabelText('Upload image'))

    expect(inputClick).toHaveBeenCalledTimes(1)
    expect(linkClick).not.toHaveBeenCalled()
  })

  it('opens the pellet file picker without navigating to the showcase', () => {
    render(<PelletProfileCard pellet={pellet} onUploadImage={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const inputClick = vi.fn()
    input.addEventListener('click', inputClick)

    fireEvent.click(screen.getByLabelText('Upload image'))

    expect(inputClick).toHaveBeenCalledTimes(1)
    expect(linkClick).not.toHaveBeenCalled()
  })

  it('keeps edit and delete working inside the rifle card link', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<RifleProfileCard rifle={rifle} mode="gear" onUploadImage={vi.fn()} onEdit={onEdit} onDelete={onDelete} />)

    fireEvent.click(screen.getByLabelText('Edit rifle'))
    fireEvent.click(screen.getByLabelText('Delete rifle'))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(linkClick).not.toHaveBeenCalled()
  })
})
