import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import VideoGuides from '../VideoGuides'
import { availableVideoGuides, videoGuides } from '../../catalog/videoGuides'

describe('VideoGuides', () => {
	it('renders every available guide and none of the planned ones', () => {
		render(<VideoGuides />)

		expect(availableVideoGuides.length).toBeGreaterThan(0)
		for (const guide of videoGuides) {
			if (guide.available) {
				expect(screen.getByRole('button', { name: new RegExp(guide.title) })).toBeInTheDocument()
			} else {
				expect(screen.queryByText(guide.title)).not.toBeInTheDocument()
			}
		}
	})

	it('opens a player pointed at the recording, and closes it again', () => {
		render(<VideoGuides />)
		const guide = availableVideoGuides[0]

		fireEvent.click(screen.getByRole('button', { name: new RegExp(guide.title) }))

		const dialog = screen.getByRole('dialog', { name: guide.title })
		const video = dialog.querySelector('video')
		expect(video).not.toBeNull()
		expect(video).toHaveAttribute('src', `/demos/${guide.slug}.webm`)
		expect(video).toHaveAttribute('poster', `/demos/${guide.slug}.jpg`)

		fireEvent.click(screen.getByRole('button', { name: 'Close video' }))
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
	})

	it('closes the player on Escape', () => {
		render(<VideoGuides />)
		fireEvent.click(screen.getByRole('button', { name: new RegExp(availableVideoGuides[0].title) }))
		expect(screen.getByRole('dialog')).toBeInTheDocument()

		fireEvent.keyDown(window, { key: 'Escape' })
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
	})

	it('has a shipped recording for every guide marked available', () => {
		// `available: true` is a promise that /demos/<slug>.webm exists — a
		// catalog entry flipped on without its file would render a card whose
		// player 404s.
		const demosDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/demos')
		for (const guide of availableVideoGuides) {
			expect(existsSync(resolve(demosDir, `${guide.slug}.webm`)), `${guide.slug}.webm is missing`).toBe(true)
			expect(existsSync(resolve(demosDir, `${guide.slug}.jpg`)), `${guide.slug}.jpg poster is missing`).toBe(true)
		}
	})
})
