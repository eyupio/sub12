import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PoweredBy } from '../PoweredBy'
import { BrandingContext, DEFAULT_BRANDING } from '../../store/branding'
import type { SiteBranding } from '../../api/site'

function renderWith(branding: Partial<SiteBranding>) {
  return render(
    <BrandingContext.Provider value={{ ...DEFAULT_BRANDING, ...branding }}>
      <PoweredBy />
    </BrandingContext.Provider>,
  )
}

describe('PoweredBy', () => {
  it('links to the project, its author and the source', () => {
    renderWith({})
    expect(screen.getByRole('link', { name: 'SUB12' })).toHaveAttribute('href', 'https://sub12.io')
    expect(screen.getByRole('link', { name: 'EyUp.io' })).toHaveAttribute('href', 'https://eyup.io')
    // AGPL-3.0 section 13: a modified copy run as a network service must offer
    // its source to the people using it.
    expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute(
      'href',
      'https://github.com/eyupio/sub12',
    )
  })

  // A self-hoster renames and recolours the deployment; the attribution is
  // served from backend constants rather than from the settings table, so
  // there is no value they can save that removes it.
  it('survives a full rebrand', () => {
    renderWith({
      site_name: 'Dale Head Rifle Club',
      tagline: 'Members only',
      deployment_mode: 'single_club',
      logo_url: '/api/v1/images/abc',
      accent_light: '#4f7a3f',
    })
    expect(screen.getByRole('link', { name: 'SUB12' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'EyUp.io' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Source' })).toBeInTheDocument()
  })

  it('opens the outbound links safely', () => {
    renderWith({})
    for (const name of ['SUB12', 'EyUp.io', 'Source']) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })
})
