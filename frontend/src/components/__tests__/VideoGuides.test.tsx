import { existsSync, readFileSync } from 'node:fs'
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

	it('keeps /demos/ off the service worker navigate fallback', () => {
		// A /demos/*.webm URL is a file, not a router path, and opening one
		// directly is a navigation. Left off the denylist, the service worker
		// answers it with index.html and the router — which has no /demos route
		// — renders "Target not found", so every shared or README link 404s for
		// anyone who had already loaded the site. Nothing about that failure
		// shows up server-side: nginx serves the file correctly.
		const config = readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), '../../../vite.config.ts'),
			'utf-8',
		)
		// Closing bracket on its own line — an inner `]` belongs to a character
		// class in one of the patterns, not to the array.
		const denylist = config.match(/navigateFallbackDenylist:\s*\[([\s\S]*?)\n\s*\],/)?.[1]
		expect(denylist, 'navigateFallbackDenylist not found in vite.config.ts').toBeDefined()
		expect(denylist).toContain('/^\\/demos\\//')
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
