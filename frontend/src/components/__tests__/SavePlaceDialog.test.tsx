import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { SavePlaceDialog } from '../SavePlaceDialog'

describe('SavePlaceDialog', () => {
  it('gives every field an accessible name from its label', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SavePlaceDialog open onClose={() => {}} onSaved={() => {}} />
      </QueryClientProvider>,
    )

    for (const name of [/^Name/, 'Address', 'Default distance', 'Unit', 'Default target preset', 'Notes']) {
      expect(screen.getByLabelText(name)).toBeTruthy()
    }
  })
})
