import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PersonaEditDialog, type PersonaEditState } from '../PersonaEditDialog'
import type { SimulatedPersona } from '../../api/adminSimulation'

vi.mock('../../utils/identicon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/identicon')>()
  return {
    ...actual,
    identiconPngFile: vi.fn(async () =>
      new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' }),
    ),
  }
})

function makePersona(overrides: Partial<SimulatedPersona> = {}): SimulatedPersona {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    display_name: 'Sam Fletcher',
    email: 'sam@example.test',
    card_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('PersonaEditDialog', () => {
  it('stages a generated avatar file when Regenerate is clicked, then Save', async () => {
    const onSave = vi.fn()
    render(
      <PersonaEditDialog
        open
        persona={makePersona()}
        pending={false}
        onSave={onSave}
        onCancel={() => {}}
      />,
    )

    fireEvent.click(screen.getByText('Regenerate avatar'))

    // The "Remove selection" button only renders once a file is staged, so its
    // appearance signals the async generation finished.
    await screen.findByText('Remove selection')

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const state = onSave.mock.calls[0][0] as PersonaEditState
    expect(state.avatarFile).toBeInstanceOf(File)
    expect(state.avatarFile?.type).toBe('image/png')
    // A staged generated avatar must not also flag a removal.
    expect(state.removeAvatar).toBe(false)
  })
})
