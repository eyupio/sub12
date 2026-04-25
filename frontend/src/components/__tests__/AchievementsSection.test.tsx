import type { ReactElement, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AchievementsSection } from '../AchievementsSection'

vi.mock('../Tooltip', () => ({
	Tooltip: ({ content, children }: { content: ReactNode; children: ReactElement }) => (
		<div>
			{children}
			<div role="tooltip">{content}</div>
		</div>
	),
}))

describe('AchievementsSection', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('uses an HTML tooltip for the achievement title instead of a native title attribute', async () => {
		render(
			<AchievementsSection
				earned={[]}
				allDefs={[
					{
						id: 'double_century',
						name: 'Double Century',
						description: 'Scored 200+ in a single card',
						icon: 'medal',
					},
				]}
			/>,
		)

		const [tileLabel] = screen.getAllByText('Double Century')
		const tile = tileLabel.closest('div')
		expect(tile).not.toBeNull()
		expect(tile).not.toHaveAttribute('title')

		const tooltip = screen.getByRole('tooltip')
		expect(tooltip).toHaveTextContent('Double Century')
	})
})