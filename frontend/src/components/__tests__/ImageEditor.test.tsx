import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImageEditor } from '../ImageEditor'

function makeFile(): File {
  // Tiny 1x1 transparent PNG bytes; the real canvas pipeline is not exercised
  // in jsdom but the component still needs a valid File reference.
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ])
  return new File([png], 'pic.png', { type: 'image/png' })
}

describe('ImageEditor', () => {
  it('renders rotate controls and Apply button', () => {
    render(<ImageEditor file={makeFile()} onSave={() => {}} onCancel={() => {}} />)
    // Two ROTATE buttons (mirrored ccw / cw) + Reset + Apply.
    const rotates = screen.getAllByText(/rotate/i)
    expect(rotates.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows aspect chips in free mode and hides them when aspect is locked', () => {
    const { rerender } = render(
      <ImageEditor file={makeFile()} onSave={() => {}} onCancel={() => {}} />,
    )
    expect(screen.getByText(/aspect/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /free/i })).toBeInTheDocument()

    rerender(
      <ImageEditor file={makeFile()} onSave={() => {}} onCancel={() => {}} aspect={1} />,
    )
    expect(screen.queryByRole('radio', { name: /free/i })).not.toBeInTheDocument()
  })

  it('fires onCancel when Escape is pressed', () => {
    const onCancel = vi.fn()
    render(<ImageEditor file={makeFile()} onSave={() => {}} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('uses a custom title when provided', () => {
    render(
      <ImageEditor
        file={makeFile()}
        onSave={() => {}}
        onCancel={() => {}}
        title="Edit avatar"
      />,
    )
    expect(screen.getByLabelText(/edit avatar/i)).toBeInTheDocument()
  })
})

