import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CatalogSearch } from '../CatalogSearch'

type Item = { name: string; brand: string }

const items: Item[] = [
  { name: 'JSB Exact', brand: 'JSB' },
  { name: 'H&N Baracuda', brand: 'H&N' },
]

const baseProps = {
  items,
  searchKeys: ['name', 'brand'] as (keyof Item)[],
  renderItem: (item: Item) => item.name,
  renderDetail: (item: Item) => item.brand,
  onSelect: vi.fn(),
  onManualEntry: vi.fn(),
  placeholder: 'Search pellets…',
}

describe('CatalogSearch', () => {
  it('exposes combobox role so screen readers can announce the widget type', () => {
    render(<CatalogSearch {...baseProps} />)

    const input = screen.getByRole('combobox')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-label', 'Search pellets…')
    expect(input).toHaveAttribute('type', 'search')
    expect(input).toHaveAttribute('aria-haspopup', 'listbox')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
  })

  it('sets aria-expanded to reflect whether the dropdown is open', () => {
    render(<CatalogSearch {...baseProps} />)

    // Dropdown starts open (open = true initial state)
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('links the input to the listbox via aria-controls / id', () => {
    render(<CatalogSearch {...baseProps} />)

    const input = screen.getByRole('combobox')
    const listbox = screen.getByRole('listbox')
    expect(listbox.id).toBeTruthy()
    expect(input).toHaveAttribute('aria-controls', listbox.id)
  })

  it('marks every suggestion as role=option with aria-selected', () => {
    render(<CatalogSearch {...baseProps} />)

    const options = screen.getAllByRole('option')
    // 2 items + "enter manually" = at least 3 options
    expect(options.length).toBeGreaterThanOrEqual(3)
    options.forEach(opt => {
      expect(opt).toHaveAttribute('aria-selected')
    })
  })
})
